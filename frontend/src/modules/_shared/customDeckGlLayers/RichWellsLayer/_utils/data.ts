import type { WellFeature } from "@webviz/subsurface-viewer";
import { sortBy } from "lodash";

import type { Vec3 } from "@lib/utils/vec3";

import {
    getCoordinateForMd,
    getMdsForTvds,
    getNormalAngle2DAtMd,
    getSegmentIndexForMd,
} from "../../WellsLayer/_private/wellTrajectoryUtils";
import type { RichWellsLayerProps } from "../RichWellsLayer";
import type {
    WellboreDataTrajectory,
    WellboreData,
    WellboreProperties,
    FormationSegmentData,
    WellboreScreenData,
    PerforationData,
    WellboreMarkerFeature,
} from "../types";

import { buildPerforationMarkerGeology, buildScreenMarkerGeology } from "./wellMarkers";

export function buildWellboreProperties(
    simplifiedTrajectory: WellboreDataTrajectory,
    wellboreData: WellboreData,
): WellboreProperties & WellFeature["properties"] {
    const segmentArr = simplifiedTrajectory.mdArr.map((md) => {
        return (
            wellboreData.formationSegments.find((seg) => seg.mdEnter <= md && seg.mdExit > md)?.segmentIdent ??
            // TODO: Better name for "outside"
            "OUTSIDE FILTER"
        );
    });

    return {
        md: [simplifiedTrajectory.mdArr],
        uuid: wellboreData.uuid,

        identifier: wellboreData.uniqueIdentifier,
        name: wellboreData.uniqueIdentifier,
        purpose: wellboreData.purpose,
        status: wellboreData.status,
        mdArr: simplifiedTrajectory.mdArr,
        tvdArr: simplifiedTrajectory.tvdMslArr,
        segmentArr: segmentArr,
    };
}

export function getAllRequiredMds(
    trajectory: WellboreDataTrajectory,
    screens: WellboreScreenData[],
    formationSegments: FormationSegmentData[],
    layerProps: RichWellsLayerProps,
) {
    const mds = new Set<number>();

    formationSegments.forEach((fs) => {
        mds.add(fs.mdEnter);
        mds.add(fs.mdExit);
    });

    screens.forEach((screen) => {
        mds.add(screen.mdTop);
        mds.add(screen.mdBottom);
    });

    layerProps.mdFilterValue?.forEach((md) => {
        if (md !== undefined) mds.add(md);
    });

    layerProps.tvdFilterValue?.forEach((tvd) => {
        if (tvd === undefined) return;
        getMdsForTvds(trajectory.tvdMslArr, trajectory.mdArr, tvd).forEach((md) => mds.add(md));
    });

    return sortBy([...mds]);
}

export function buildWellborePerforationMarkers(
    perforations: PerforationData[],
    wellboreTrajectory: WellboreDataTrajectory,
    wellboreProperties: WellboreProperties,
    vec3Trajectory: Vec3[],
): WellboreMarkerFeature[] {
    const features: WellboreMarkerFeature[] = [];

    for (const perforation of perforations) {
        // Perforations have a little bit of length (the size of the hole?). Use the point between as the geometry's anchor
        const perforationAnchorMd = (perforation.mdTop + perforation.mdBottom) / 2;

        const rotation = getNormalAngle2DAtMd(perforationAnchorMd, wellboreTrajectory.mdArr, vec3Trajectory);

        if (rotation === null) continue;

        const perforationCoordinate = getCoordinateForMd(perforationAnchorMd, wellboreTrajectory.mdArr, vec3Trajectory);
        const segmentIndex = getSegmentIndexForMd(perforationAnchorMd, wellboreTrajectory.mdArr);

        if (perforationCoordinate) {
            features.push({
                type: "Feature",
                id: wellboreProperties.uuid,
                geometry: buildPerforationMarkerGeology(perforationCoordinate, rotation),
                properties: {
                    ...wellboreProperties,
                    type: "screen",
                    md: perforationAnchorMd,
                    tvd: perforationCoordinate.z,
                    segment: wellboreProperties.segmentArr[segmentIndex],
                },
            });
        }
    }

    return features;
}

export function mergeScreenSegments(screenData: WellboreScreenData[]): WellboreScreenData[] {
    screenData = sortBy(screenData, (data) => data.mdTop); // TODO: This should be sorted by the backend, preferably?

    return screenData.reduce((acc, screen) => {
        if (acc.at(-1) && acc.at(-1)!.mdBottom === screen.mdTop) {
            acc.at(-1)!.mdBottom = screen.mdBottom;
            return acc;
        } else {
            return [...acc, { ...screen }];
        }
    }, screenData);
}

export function buildWellboreScreenMarkers(
    screenData: WellboreScreenData[],
    wellboreTrajectory: WellboreDataTrajectory,
    wellboreProperties: WellboreProperties,
    vec3Trajectory: Vec3[],
): WellboreMarkerFeature[] {
    // TODO: This should be sorted by the backend, preferably?
    screenData = sortBy(screenData, (data) => data.mdTop);

    const markerFeatures = [] as WellboreMarkerFeature[];

    let screenMdStart = null;
    let screenMdEnd = null;

    for (let index = 0; index < screenData.length; index++) {
        // Some screen entries are adjacent. We only want to add markers at the start and end of the combined
        // screen length, so look for
        const screen = screenData[index];
        const nextScreen = screenData[index + 1];

        if (screenMdStart === null) screenMdStart = screen.mdTop;

        if (nextScreen?.mdTop !== undefined && screen.mdBottom >= nextScreen.mdTop) continue;
        else screenMdEnd = screen.mdBottom;

        const rotationStart = getNormalAngle2DAtMd(screenMdStart, wellboreTrajectory.mdArr, vec3Trajectory);
        const rotationEnd = getNormalAngle2DAtMd(screenMdEnd, wellboreTrajectory.mdArr, vec3Trajectory);

        if (rotationStart !== null && rotationEnd !== null) {
            const coordinateStart = getCoordinateForMd(screenMdStart, wellboreTrajectory.mdArr, vec3Trajectory);
            const coordinateEnd = getCoordinateForMd(screenMdEnd, wellboreTrajectory.mdArr, vec3Trajectory);
            // TODO: Optimize to avoid running over again
            const segmentIndexStart = getSegmentIndexForMd(screenMdStart, wellboreTrajectory.mdArr);
            const segmentIndexEnd = getSegmentIndexForMd(screenMdEnd, wellboreTrajectory.mdArr);

            if (coordinateStart && coordinateEnd) {
                markerFeatures.push({
                    type: "Feature",
                    geometry: buildScreenMarkerGeology(coordinateStart, rotationStart, "start"),
                    properties: {
                        ...wellboreProperties,
                        type: "screen",
                        tvd: coordinateStart.z,
                        md: screenMdStart,
                        segment: wellboreProperties.segmentArr[segmentIndexStart],
                    },
                });
                markerFeatures.push({
                    type: "Feature",
                    geometry: buildScreenMarkerGeology(coordinateEnd, rotationEnd, "end"),
                    properties: {
                        ...wellboreProperties,
                        type: "screen",
                        tvd: coordinateEnd.z,
                        md: screenMdEnd,
                        segment: wellboreProperties.segmentArr[segmentIndexEnd],
                    },
                });
            }
        }

        screenMdStart = null;
        screenMdEnd = null;
    }

    return markerFeatures;
}
