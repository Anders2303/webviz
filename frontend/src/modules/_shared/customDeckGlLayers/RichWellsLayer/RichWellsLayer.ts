import type { LayersList, UpdateParameters, FilterContext, Color, LayerProps, PickingInfo, Layer } from "@deck.gl/core";
import { CompositeLayer } from "@deck.gl/core";
import { DataFilterExtension } from "@deck.gl/extensions";
import type { GeoJsonLayerProps } from "@deck.gl/layers";
import { GeoJsonLayer } from "@deck.gl/layers";
import { GL } from "@luma.gl/constants";
import { LabelOrientation, WellLabelLayer } from "@webviz/subsurface-viewer/dist/layers/wells/layers/wellLabelLayer";
import type { Position, Feature, FeatureCollection } from "geojson";
import { inRange, zip, zipWith } from "lodash";

import { allSameLength } from "@lib/utils/arrays";
import { point2Distance, vec2FromArray } from "@lib/utils/vec2";
import { createTrajectoryWithMdEntries, simplifyWellTrajectoryRadialDist } from "@modules/_shared/utils/wellbore";

import type { DashedSectionsPathLayerProps } from "./_sublayers/DashedSectionsPathLayer";
import { DashedSectionsPathLayer } from "./_sublayers/DashedSectionsPathLayer";
import {
    buildWellborePerforationMarkers,
    buildWellboreProperties,
    buildWellboreScreenMarkers,
    getAllRequiredMds,
    mergeScreenSegments,
} from "./_utils/data";
import { getWithAccessorLike } from "./_utils/deckgl";
import type { TrajectoryFilterExtensionProps } from "./TvdFilterExtension";
import type {
    WellboreData,
    WellboreTrajectory,
    WellboreProperties,
    WellboreMarkerFeature,
    WellboreTrajectoryFeature,
    WellboreDataTrajectory,
} from "./types";

const SIMPLIFICATION_RADIAL_DIST = 1.5;

export type RichWellsLayerProps = {
    data: WellboreData[];

    getIsSelected?: (d: WellboreData) => boolean;

    discardFilteredSections?: boolean;
    segmentFilterValue?: string[];
    tvdFilterValue?: [min: number | undefined, max: number | undefined];
    mdFilterValue?: [min: number | undefined, max: number | undefined];
    getWellColor?: (wellboreUwi: string) => { r: number; g: number; b: number };
    isWellboreSelected?: (uuid: string) => boolean;
};

export class RichWellsLayer extends CompositeLayer<RichWellsLayerProps> {
    static layerName = "RichWellsLayer";

    declare state: {
        // TODO: Heads

        // ? Should these be in a single object?
        wellboreTrajectories: WellboreTrajectory[];
        wellboreMarkers: FeatureCollection;

        // TODO: Only needed for label layer
        geoTrajectories: FeatureCollection;

        // Track hovered wellbore
        hoveredWellbore: string | null;
        highlightColor: number[];
    };

    constructor(props: RichWellsLayerProps & LayerProps) {
        super(props);

        this.getWellboreColor = this.getWellboreColor.bind(this);
    }

    // GeoJsonLayer handles it's own hight indices internally, so auto-highlight via
    // getSubLayerRow doesn't work out-of-the-box. We instead need to manually implement
    // automatic highlight-colors
    onHover(info: PickingInfo /* pickingEvent: any */): boolean {
        if (this.props.autoHighlight) {
            const highlightColor = getWithAccessorLike(this.props.highlightColor, info);

            this.setState({
                hoveredWellbore: info.object?.uuid ?? null,
                highlightColor: highlightColor,
            });
        }

        return false;
    }

    updateState({ props, changeFlags }: UpdateParameters<this>) {
        // TODO: Optimize. Less recomputations
        if (!changeFlags.dataChanged) return;

        const wellboreTrajectories: WellboreTrajectory[] = [];
        const wellboreMarkers: Feature[] = [];

        const geoTrajectories: FeatureCollection = {
            type: "FeatureCollection",
            features: [],
        };

        // TODO: Only update things based on change-flags?

        for (let index = 0; index < props.data.length; index++) {
            const wellboreData = props.data[index];

            if (
                !allSameLength(
                    wellboreData.trajectory.eastingArr,
                    wellboreData.trajectory.northingArr,
                    wellboreData.trajectory.tvdMslArr,
                    wellboreData.trajectory.mdArr,
                )
            ) {
                throw Error(`Trajectory arrays are not of equal length for wellbore ${wellboreData.uuid}`);
            }

            const mergedScreenSegments = mergeScreenSegments(wellboreData.screens);

            // Simplify trajectory path for 2D (remove stacked points for vertical sections of the well)
            const __simplifiedTrajectory = createSimplifiedTrajectory(wellboreData.trajectory);

            // Filter and dashes need the trajectories vertex to be present
            // TODO: Consider putting it inside the layer
            // TODO: The "DataFilter" extension from deck.gl is able to interpolate the values between vertexes (numeric filter only)
            const requiredMds = getAllRequiredMds(
                __simplifiedTrajectory,
                mergedScreenSegments,
                wellboreData.formationSegments,
                props,
            );

            const wellboreTrajectory = createTrajectoryWithMdEntries(__simplifiedTrajectory, ...requiredMds);

            // Some utilities use vector arrays instead
            const vec3Trajectory = zipWith(
                wellboreTrajectory.eastingArr,
                wellboreTrajectory.northingArr,
                wellboreTrajectory.tvdMslArr,
                (x, y, z) => ({ x, y, z }),
            );

            const wellboreProperties = buildWellboreProperties(wellboreTrajectory, wellboreData);

            // Build assorted markers along the path
            const perforationMarkers = buildWellborePerforationMarkers(
                wellboreData.perforations,
                wellboreTrajectory,
                wellboreProperties,
                vec3Trajectory,
            ).map((m) => this.getSubLayerRow(m, wellboreData, index));

            const screenMarkers = buildWellboreScreenMarkers(
                mergedScreenSegments,
                wellboreTrajectory,
                wellboreProperties,
                vec3Trajectory,
            ).map((m) => this.getSubLayerRow(m, wellboreData, index));

            // Stored dashed intervals
            const dashedSections = [] as [from: number, to: number][];
            for (let index = 0; index < screenMarkers.length; index += 2) {
                const startMarker = screenMarkers[index];
                const endMarker = screenMarkers[index + 1];

                dashedSections.push([startMarker.properties.md, endMarker.properties.md]);
            }

            // Create positions for the final trajectory path
            const path = zip(
                wellboreTrajectory.eastingArr,
                wellboreTrajectory.northingArr,
                wellboreTrajectory.tvdMslArr,
            ) as [number, number, number][];

            const wellboreTrajectorySubData: WellboreTrajectory = {
                properties: wellboreProperties,
                dashedMdIntervals: dashedSections,
                path: path,
            };

            wellboreTrajectories.push(this.getSubLayerRow(wellboreTrajectorySubData, wellboreData, index));
            wellboreMarkers.push(...perforationMarkers, ...screenMarkers);
            geoTrajectories.features.push({
                type: "Feature",
                properties: wellboreProperties,
                geometry: {
                    type: "GeometryCollection",
                    geometries: [
                        {
                            type: "LineString",
                            coordinates: wellboreTrajectorySubData.path as Position[],
                        },
                    ],
                },
            });
        }

        this.setState({ wellboreTrajectories, wellboreMarkers, geoTrajectories });
    }

    filterSubLayer(context: FilterContext): boolean {
        if (context.layer.id === "welltrajectory-labels-layer") {
            return context.viewport.zoom > -4;
        }

        return true;
    }

    private getWellboreColor(d: { properties: WellboreProperties }): Color {
        if (this.props.autoHighlight && d.properties.uuid === this.state.hoveredWellbore) {
            return this.state.highlightColor as Color;
        }

        if (this.props?.isWellboreSelected?.(d.properties.uuid)) {
            return [255, 0, 0];
        }

        // Use the custom color function if provided
        if (this.props?.getWellColor) {
            const color = this.props.getWellColor(d.properties.identifier);
            return [color.r, color.g, color.b];
        }

        return [130, 130, 130];
    }

    renderLayers(): Layer | null | LayersList {
        const sharedProps: Partial<LayerProps & TrajectoryFilterExtensionProps & Record<string, any>> = {
            lineWidthMinPixels: 3,
            getLineWidth: 6,

            positionFormat: "XY",
            trajectoryDiscardFiltered: !!this.props.discardFilteredSections,
            pickable: true,

            // ! We manually re-implement auto-highlight color; see onHover(...)
            autoHighlight: false,
        };

        const layers = [
            // --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
            // ---[ Main path ]--- --- --- --- --- --- --- --- --- --- ---
            new DashedSectionsPathLayer(
                this.getSubLayerProps({
                    ...sharedProps,
                    data: this.state.wellboreTrajectories,
                    id: "well-path-layer",
                    getColor: this.getWellboreColor,
                    widthMinPixels: sharedProps.lineWidthMinPixels,
                    getWidth: sharedProps.getLineWidth,
                    getPath: (d: WellboreTrajectory) => d.path,
                    dashArray: [3, 3],
                    isSegmentDashed: (d, segmentIndex) => {
                        if (!d.dashedMdIntervals) return false;

                        const segmentMd = d.properties.mdArr[segmentIndex];
                        const inDashRange = d.dashedMdIntervals?.some(([start, end]) =>
                            // Offset the range a little, to account for points that are slightly close to the point
                            inRange(segmentMd, start, end),
                        );

                        return inDashRange;
                    },

                    extensions: [new DataFilterExtension({ filterSize: 1 })],
                    filterRange: [1, 1],
                    getFilterValue: (d: WellboreTrajectory) =>
                        d.path.map((_, i) => {
                            const md = d.properties.mdArr[i];
                            const tvd = d.properties.tvdArr[i];
                            const segment = d.properties.segmentArr[i];

                            let segmentIsValid = true;

                            segmentIsValid &&= !isTvdFiltered(tvd, this.props.tvdFilterValue);
                            segmentIsValid &&= !isMdFiltered(md, this.props.mdFilterValue);
                            segmentIsValid &&= !isSegmentFiltered(segment, this.props.segmentFilterValue);

                            return Number(segmentIsValid);
                        }),

                    // Disable depth test to render on top of other layers
                    parameters: { [GL.DEPTH_TEST]: false },
                    updateTriggers: {
                        getColor: [this.state.hoveredWellbore],
                    },
                } as Partial<DashedSectionsPathLayerProps<WellboreTrajectory>>),
            ),

            // --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
            // ---[ Well markers ]---- --- --- --- --- --- --- --- --- ---
            new GeoJsonLayer({
                ...this.getSubLayerProps({
                    ...sharedProps,
                    id: "well-markers-layer",
                    data: this.state.wellboreMarkers,

                    getLineColor: this.getWellboreColor,
                    getFillColor: [0, 0, 0, 0],
                    getLineWidth: 2,

                    extensions: [new DataFilterExtension({ filterSize: 1 })],
                    filterRange: [1, 1],
                    getFilterValue: (d: WellboreMarkerFeature) => {
                        const { md, tvd, segment } = d.properties;

                        let segmentIsValid = true;

                        segmentIsValid &&= !isTvdFiltered(tvd, this.props.tvdFilterValue);
                        segmentIsValid &&= !isMdFiltered(md, this.props.mdFilterValue);
                        segmentIsValid &&= !isSegmentFiltered(segment, this.props.segmentFilterValue);

                        return Number(segmentIsValid);
                    },

                    updateTriggers: {
                        getLineColor: [this.state.hoveredWellbore],
                    },
                } as Partial<GeoJsonLayerProps>),
            }),

            // --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
            // ---[ Well labels ]- --- --- --- --- --- --- --- --- --- ---
            new WellLabelLayer({
                id: "welltrajectory-labels-layer",

                data: this.state.geoTrajectories.features,
                mergeLabels: false,
                autoPosition: false,
                getPositionAlongPath: 1,
                getAlignmentBaseline: "top",
                getTextAnchor: "end",
                // Performance tanks if there's too many labels
                orientation:
                    this.state.geoTrajectories.features.length < 200
                        ? LabelOrientation.TANGENT
                        : LabelOrientation.HORIZONTAL,

                positionFormat: "XY",

                // @ts-expect-error --- Subsurface type is a bit too aggressive
                getText: (d: WellboreTrajectoryFeature) => d.properties.identifier,
                getBackgroundColor: [255, 255, 255, 255 * 0.1],
                // getColor: []
                getBorderWidth: 0,
                background: true,
                visible: true,

                // @ts-expect-error -- Parameter type doesn't expose these
                parameters: { [GL.DEPTH_TEST]: false },
            }),
        ];

        return layers;
    }
}

// --- --- --- --- --- --- --- --- --- --- --- ---
// ---[ Helper functions ] --- --- --- --- --- ---
// --- --- --- --- --- --- --- --- --- --- --- ---

// Get rid of points that are right above eachother, since they're not needed in 2D
function createSimplifiedTrajectory(trajectory: WellboreDataTrajectory) {
    return simplifyWellTrajectoryRadialDist(trajectory, SIMPLIFICATION_RADIAL_DIST, (point1, point2) => {
        const vecPoint1 = vec2FromArray([point1.easting, point1.northing]);
        const vecPoint2 = vec2FromArray([point2.easting, point2.northing]);

        return point2Distance(vecPoint1, vecPoint2);
    });
}

function isTvdFiltered(tvd: number, tvdFilterValue: undefined | (number | undefined)[]): boolean {
    // ! Assumes tvd-range has been sanitized
    let isFiltered = false;

    if (tvdFilterValue?.length) {
        if (tvdFilterValue[0] !== undefined) {
            isFiltered ||= tvd < tvdFilterValue[0];
        }
        if (tvdFilterValue[1] !== undefined) {
            isFiltered ||= tvd > tvdFilterValue[1];
        }
    }

    return isFiltered;
}

function isMdFiltered(md: number, mdFilterValue: undefined | (number | undefined)[]): boolean {
    let isFiltered = false;

    if (mdFilterValue) {
        if (mdFilterValue[0] !== undefined) {
            isFiltered ||= md < mdFilterValue[0];
        }
        if (mdFilterValue[1] !== undefined) {
            isFiltered ||= md > mdFilterValue[1];
        }
    }

    return isFiltered;
}

function isSegmentFiltered(segment: string, segmentFilterValue: undefined | string[]) {
    if (!segmentFilterValue?.length) return false;

    return !segmentFilterValue.includes(segment);
}
