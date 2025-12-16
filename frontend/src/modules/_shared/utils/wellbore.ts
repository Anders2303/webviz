import type { Color } from "@deck.gl/core";
import type { LineString, Point } from "geojson";
import simplify from "simplify-js";

import type { WellboreTrajectory_api } from "@api";
import { point2Distance, vec2FromArray } from "@lib/utils/vec2";
import { distance, fromArray } from "@lib/utils/vec3";
import * as vec3 from "@lib/utils/vec3";

import { getSegmentIndexForMd } from "../customDeckGlLayers/WellsLayer/_private/wellTrajectoryUtils";
import type { GeoWellFeature } from "../DataProviderFramework/visualization/deckgl/makeDrilledWellTrajectoriesLayer";

function normalizeVector(vector: number[]): number[] {
    const vectorLength = Math.sqrt(vector[0] ** 2 + vector[1] ** 2);
    return [vector[0] / vectorLength, vector[1] / vectorLength];
}

export type MinimalWellboreTrajectory = Pick<
    WellboreTrajectory_api,
    "eastingArr" | "mdArr" | "northingArr" | "tvdMslArr"
>;

type TrajectoryPoint = { easting: number; northing: number; tvdMsl: number };

function defaultRadialDistance(point1: TrajectoryPoint, point2: TrajectoryPoint) {
    const vec1 = fromArray([point1.easting, point1.northing, point1.tvdMsl]);
    const vec2 = fromArray([point2.easting, point2.northing, point2.tvdMsl]);

    return distance(vec1, vec2);
}

export function simplifyWellTrajectoryRadialDist<TTrajectory extends MinimalWellboreTrajectory>(
    trajectory: TTrajectory,
    threshold: number,
    computeDistance = defaultRadialDistance,
): TTrajectory {
    const thresholdSquared = threshold * threshold;

    let prevPoint: TrajectoryPoint | null = null;

    const simplifiedTrajectory: TTrajectory = {
        ...trajectory,
        eastingArr: [],
        northingArr: [],
        tvdMslArr: [],
        mdArr: [],
    };

    for (let index = 0; index < trajectory.eastingArr.length; index++) {
        const point = {
            easting: trajectory.eastingArr[index],
            northing: trajectory.northingArr[index],
            tvdMsl: trajectory.tvdMslArr[index],
            md: trajectory.mdArr[index],
        };

        if (
            // Always include the first and last points
            !prevPoint ||
            index === trajectory.eastingArr.length - 1 ||
            computeDistance(point, prevPoint) > thresholdSquared
        ) {
            simplifiedTrajectory.eastingArr.push(point.easting);
            simplifiedTrajectory.northingArr.push(point.northing);
            simplifiedTrajectory.tvdMslArr.push(point.tvdMsl);
            simplifiedTrajectory.mdArr.push(point.md);

            prevPoint = point;
        }
    }
    return simplifiedTrajectory;
}

// const MD_MATCH_THRESHOLD = 0.01;
const MD_MATCH_THRESHOLD = 0.01;

/**
 * Create a new trajectory and MD array by injecting new MD entries into an
 * existing trajectory. New points are interpolated linearly
 * @param trajectory A list 3D positions describing the trajectory path
 * @param mdArray A list of MD values per segment
 * @param mds MD values to inject into the trajectory
 * @returns A new trajectory and MD array with the new entries injected
 */
export function createTrajectoryWithMdEntries<TTrajectory extends MinimalWellboreTrajectory>(
    trajectory: TTrajectory,
    ...mds: number[]
): TTrajectory {
    if (trajectory.mdArr.length < 2) return { ...trajectory };
    if (!mds.length) return { ...trajectory };

    const { eastingArr, northingArr, tvdMslArr, mdArr } = trajectory;

    const newTrajectory = {
        ...trajectory,
        // ! These path arrays will be mutated as we add points
        eastingArr: [...eastingArr],
        northingArr: [...northingArr],
        tvdMslArr: [...tvdMslArr],
        mdArr: [...mdArr],
    };

    for (const md of mds) {
        const segmentIndex = getSegmentIndexForMd(md, newTrajectory.mdArr); // Closest *preceding* point

        if (segmentIndex === -1) continue; // MD is not on trajectory

        const segmentMd = newTrajectory.mdArr[segmentIndex];

        if (md < segmentMd - MD_MATCH_THRESHOLD || md > segmentMd + MD_MATCH_THRESHOLD) {
            const point = getCoordinateForMd(newTrajectory, md);

            if (point) {
                //Inject the point *after* the point we located
                newTrajectory.eastingArr.splice(segmentIndex + 1, 0, point[0]);
                newTrajectory.northingArr.splice(segmentIndex + 1, 0, point[1]);
                newTrajectory.tvdMslArr.splice(segmentIndex + 1, 0, point[2]);
                newTrajectory.mdArr.splice(segmentIndex + 1, 0, md);
            }
        }
    }

    return newTrajectory;
}

/**
 * Creates a simplified curve of (x,y) points using simplify-js.
 *
 * If the number of points is less than or equal to 2, it returns the original points without duplicates (if any).
 */
export function createSimplifiedCurveFromXyPoints(
    xyPointsArray: { x: number; y: number }[],
    epsilon: number,
): number[][] {
    // Find simplified curve (simplify() has early return for number of points <= 2)
    if (xyPointsArray.length <= 2) {
        // Original points, without duplicate points if existing
        return xyPointsArray
            .map((point) => [point.x, point.y])
            .filter(
                (point, index, array) =>
                    index === 0 || point[0] !== array[index - 1][0] || point[1] !== array[index - 1][1],
            );
    }
    return simplify(xyPointsArray, epsilon).map((point) => [point.x, point.y]);
}

export type SimplifiedWellboreTrajectoryInXyPlaneResult = {
    simplifiedWellboreTrajectoryXy: number[][];
    actualSectionLengths: number[];
};

/*
    Calculates a simplified version of the wellbore trajectory in the XY plane by using the Ramer-Douglas-Peucker algorithm.
    Can also extend the trajectory by a specified length in the direction of the first and last non-zero vectors.
    If the wellbore is completely vertical, the trajectory will be extended in the x-direction.
*/
export function calcExtendedSimplifiedWellboreTrajectoryInXYPlane(
    wellboreTrajectory: number[][],
    extensionLength: number = 0,
    epsilon: number = 0.1,
): SimplifiedWellboreTrajectoryInXyPlaneResult {
    const simplifiedTrajectoryXy: number[][] = [];
    const actualSectionLengths: number[] = [];

    const wellboreTrajectoryXyPoints = wellboreTrajectory.map((point) => ({ x: point[0], y: point[1] }));

    // Get simplified curve from xy trajectory
    const simplifiedCurveXy = createSimplifiedCurveFromXyPoints(wellboreTrajectoryXyPoints, epsilon);

    let lastWellboreTrajectoryIndex = 0;
    for (const [index, point] of simplifiedCurveXy.entries()) {
        simplifiedTrajectoryXy.push([point[0], point[1]]);

        if (index === 0) {
            continue;
        }

        let sectionLength = 0;
        for (let i = lastWellboreTrajectoryIndex + 1; i < wellboreTrajectory.length; i++) {
            sectionLength += point2Distance(
                vec2FromArray(wellboreTrajectory[i]),
                vec2FromArray(wellboreTrajectory[i - 1]),
            );

            if (wellboreTrajectory[i][0] === point[0] && wellboreTrajectory[i][1] === point[1]) {
                actualSectionLengths.push(sectionLength);
                lastWellboreTrajectoryIndex = i;
                break;
            }
        }
    }

    if (extensionLength > 0) {
        const vectorEndPoint = simplifiedCurveXy[simplifiedCurveXy.length - 1];
        let vectorStartPoint = vectorEndPoint;
        for (let i = simplifiedCurveXy.length - 2; i >= 0; i--) {
            if (simplifiedCurveXy[i][0] !== vectorEndPoint[0] || simplifiedCurveXy[i][1] !== vectorEndPoint[1]) {
                vectorStartPoint = simplifiedCurveXy[i];
                break;
            }
        }

        const vector = [vectorEndPoint[0] - vectorStartPoint[0], vectorEndPoint[1] - vectorStartPoint[1]];

        if (vector[0] === 0 && vector[1] === 0) {
            vector[0] = 1;
        }

        const normalizedVector = normalizeVector(vector);

        const extendedFirstPoint = [
            simplifiedCurveXy[0][0] - normalizedVector[0] * extensionLength,
            simplifiedCurveXy[0][1] - normalizedVector[1] * extensionLength,
        ];
        const extendedLastPoint = [
            simplifiedCurveXy[simplifiedCurveXy.length - 1][0] + normalizedVector[0] * extensionLength,
            simplifiedCurveXy[simplifiedCurveXy.length - 1][1] + normalizedVector[1] * extensionLength,
        ];

        simplifiedTrajectoryXy.unshift(extendedFirstPoint);
        simplifiedTrajectoryXy.push(extendedLastPoint);

        actualSectionLengths.unshift(
            point2Distance(vec2FromArray(extendedFirstPoint), vec2FromArray(simplifiedCurveXy[0])),
        );
        actualSectionLengths.push(
            point2Distance(
                vec2FromArray(extendedLastPoint),
                vec2FromArray(simplifiedCurveXy[simplifiedCurveXy.length - 1]),
            ),
        );
    }

    return {
        simplifiedWellboreTrajectoryXy: simplifiedTrajectoryXy,
        actualSectionLengths,
    };
}

export function zipCoords(x_arr: number[], y_arr: number[], z_arr: number[]): number[][] {
    const coords: number[][] = [];
    for (let i = 0; i < x_arr.length; i++) {
        coords.push([x_arr[i], y_arr[i], z_arr[i]]);
    }

    return coords;
}

export function wellTrajectoryToGeojson(
    wellTrajectory: WellboreTrajectory_api,
    selectedWellboreUuid?: string,
): GeoWellFeature {
    const wellHeadPoint: Point = {
        type: "Point",
        coordinates: [wellTrajectory.eastingArr[0], wellTrajectory.northingArr[0], wellTrajectory.tvdMslArr[0]],
    };
    const trajectoryLineString: LineString = {
        type: "LineString",
        coordinates: zipCoords(wellTrajectory.eastingArr, wellTrajectory.northingArr, wellTrajectory.tvdMslArr),
    };

    let color = [150, 150, 150] as Color;
    let lineWidth = 2;
    let wellHeadSize = 1;
    if (wellTrajectory.wellboreUuid === selectedWellboreUuid) {
        color = [255, 0, 0];
        lineWidth = 5;
        wellHeadSize = 10;
    }

    const geometryCollection: GeoWellFeature = {
        type: "Feature",
        geometry: {
            type: "GeometryCollection",
            geometries: [wellHeadPoint, trajectoryLineString],
        },
        properties: {
            uuid: wellTrajectory.wellboreUuid,
            uwi: wellTrajectory.uniqueWellboreIdentifier,
            lineWidth,
            wellHeadSize,
            name: wellTrajectory.uniqueWellboreIdentifier,
            color,
            md: [wellTrajectory.mdArr],
        },
    };

    return geometryCollection;
}

/**
 * Interpolates 3D coordinates for a given MD on a trajectory
 * @param md A measured depth along the trajectory
 * @param mdArray A list MD values per segment
 * @param trajectory A list 3D positions describing the trajectory path
 * @returns An interpolated 3D position
 */
export function getCoordinateForMd(trajectory: MinimalWellboreTrajectory, md: number): number[] | null {
    const { mdArr, eastingArr, northingArr, tvdMslArr } = trajectory;
    const segmentIndex = getSegmentIndexForMd(md, mdArr);

    if (segmentIndex === -1) {
        return null;
    }

    const md0 = mdArr[segmentIndex];
    const md1 = mdArr[segmentIndex + 1];

    const pos0 = [eastingArr[segmentIndex], northingArr[segmentIndex], tvdMslArr[segmentIndex]];
    const pos1 = [eastingArr[segmentIndex + 1], northingArr[segmentIndex + 1], tvdMslArr[segmentIndex + 1]];

    const survey0 = vec3.fromArray(pos0);
    const survey1 = vec3.fromArray(pos1);

    const dv = vec3.distance(survey0, survey1) as number;
    if (dv === 0) {
        return null;
    }

    const scalar_projection = (md - md0) / (md1 - md0);

    return [
        survey0.x + scalar_projection * (survey1.x - survey0.x),
        survey0.y + scalar_projection * (survey1.y - survey0.y),
        survey0.z + scalar_projection * (survey1.z - survey0.z),
    ];
}
