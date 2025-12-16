import { allSameLength } from "@lib/utils/arrays";
import * as vec2 from "@lib/utils/vec2";
import * as vec3 from "@lib/utils/vec3";

function squared_distance(a: vec3.Vec3, b: vec3.Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

function distPointToSegmentSquared(segment: { v: vec3.Vec3; w: vec3.Vec3 }, point: vec3.Vec3): number {
    const l2 = squared_distance(segment.v, segment.w);
    if (l2 === 0) return squared_distance(point, segment.v);
    let t =
        ((point.x - segment.v.x) * (segment.w.x - segment.v.x) +
            (point.y - segment.v.y) * (segment.w.y - segment.v.y) +
            (point.z - segment.v.z) * (segment.w.z - segment.v.z)) /
        l2;
    t = Math.max(0, Math.min(1, t));
    return squared_distance(point, {
        x: segment.v.x + t * (segment.w.x - segment.v.x),
        y: segment.v.y + t * (segment.w.y - segment.v.y),
        z: segment.v.z + t * (segment.w.z - segment.v.z),
    });
}

function getSegmentIndex(coord: vec3.Vec3, path: vec3.Vec3[]): number {
    let minD = Number.MAX_VALUE;
    let segmentIndex = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const d = distPointToSegmentSquared({ v: path[i], w: path[i + 1] }, coord);
        if (d > minD) continue;

        segmentIndex = i;
        minD = d;
    }
    return segmentIndex;
}

function interpolateDataOnTrajectory(coord: vec3.Vec3, data: number[], trajectory: vec3.Vec3[]): number {
    // if number of data points in less than 1 or
    // length of data and trajectory are different we cannot interpolate.
    if (data.length <= 1 || data.length != trajectory.length) return -1;

    // Identify closest well path leg to coord.
    const segmentIndex = getSegmentIndex(coord, trajectory);

    const index0 = segmentIndex;
    const index1 = index0 + 1;

    // Get the nearest data.
    const data0 = data[index0];
    const data1 = data[index1];

    // Get the nearest survey points.
    const survey0 = trajectory[index0];
    const survey1 = trajectory[index1];

    const dv = vec3.distance(survey0, survey1) as number;
    if (dv === 0) {
        return -1;
    }

    // Calculate the scalar projection onto segment.
    const v0 = vec3.subtract(coord, survey0);
    const v1 = vec3.subtract(survey1, survey0);

    // scalar_projection in interval [0,1]
    const scalar_projection: number = vec3.dot(v0, v1) / (dv * dv);

    // Interpolate data.
    return data0 * (1.0 - scalar_projection) + data1 * scalar_projection;
}

export function getMd(coord: vec3.Vec3, mdArray: number[], trajectory: vec3.Vec3[]): number | null {
    return interpolateDataOnTrajectory(coord, mdArray, trajectory);
}

/**
 * Gets the segment index of *the first* point of a segment that contains the given MD
 */
export function getSegmentIndexForMd(md: number, mdArray: number[]): number {
    if (!mdArray.length) return -1;
    if (md < mdArray[0] || md > mdArray.at(-1)!) {
        console.warn(`MD value ${md} is outside of MD-array!`);
        return -1;
    }

    let segmentIndex = 0;
    for (let i = 0; i < mdArray.length - 1; i++) {
        if (mdArray[i] <= md && md <= mdArray[i + 1]) {
            segmentIndex = i;
            break;
        }
    }

    return segmentIndex;
}

/**
 * Interpolates 3D coordinates for a given MD on a trajectory
 * @param md A measured depth along the trajectory
 * @param mdArray A list MD values per segment
 * @param trajectory A list 3D positions describing the trajectory path
 * @returns An interpolated 3D position
 */
export function getCoordinateForMd(md: number, mdArray: number[], trajectory: vec3.Vec3[]): vec3.Vec3 | null {
    const segmentIndex = getSegmentIndexForMd(md, mdArray);

    if (segmentIndex === -1) {
        return null;
    }

    const md0 = mdArray[segmentIndex];
    const md1 = mdArray[segmentIndex + 1];

    const survey0 = trajectory[segmentIndex];
    const survey1 = trajectory[segmentIndex + 1];

    const dv = vec3.distance(survey0, survey1) as number;
    if (dv === 0) {
        return null;
    }

    const scalar_projection = (md - md0) / (md1 - md0);

    return {
        x: survey0.x + scalar_projection * (survey1.x - survey0.x),
        y: survey0.y + scalar_projection * (survey1.y - survey0.y),
        z: survey0.z + scalar_projection * (survey1.z - survey0.z),
    };
}

/**
 * Interpolates MD values for one or more TVDs. Note that a single TVD can return multiple MD values.
 * @param tvdArray An array of TVD values per segment
 * @param mdArray An array of MD values per segment
 * @param tvds One or more TVD values to interpolate MDs for
 * @returns An array of interpolated MD values
 */
export function getMdsForTvds(tvdArray: number[], mdArray: number[], ...tvds: number[]): number[] {
    if (!allSameLength(tvdArray, mdArray)) throw Error("Segment arrays are not of equal length");
    if (tvdArray.length < 2) return [];
    if (!tvds.length) return [];

    // Sort descending so popping returns the smallest value
    const sortedTvdsToFind = tvds.toSorted((a, b) => b - a);

    let tvdToFind = sortedTvdsToFind.pop();
    const mdValues = [] as number[];

    for (let index = 0; index < mdArray.length - 1; index++) {
        if (tvdToFind === undefined) break;

        const md = mdArray[index];
        const tvd = tvdArray[index];

        const nextMd = mdArray[index + 1];
        const nextTvd = tvdArray[index + 1];

        // Process all TVDs that fall within this segment
        while (tvdToFind !== undefined && tvdToFind >= tvd && tvdToFind <= nextTvd) {
            const interpolatedT = (tvdToFind - tvd) / (nextTvd - tvd);
            const interpolatedMd = md + interpolatedT * (nextMd - md);

            mdValues.push(interpolatedMd);
            tvdToFind = sortedTvdsToFind.pop();
        }
    }

    return mdValues;
}

/**
 * Get the normal angle at a given MD in a 2-dimensional trajectory
 * @param md MD point to get the normal angle at
 * @param mdArray A list MD values per segment
 * @param trajectory A list 2D positions describing the trajectory path
 * @returns An angle in radians, or null if MD is out of bounds
 */
export function getNormalAngle2DAtMd(md: number, mdArray: number[], trajectory: vec2.Vec2[]): number | null {
    const segmentIndex = getSegmentIndexForMd(md, mdArray);

    if (segmentIndex === -1) return null;

    const segmentPointStart = trajectory[segmentIndex];
    const segmentPointEnd = trajectory[segmentIndex + 1];

    const dirVec: vec2.Vec2 = vec2.subtractVec2(segmentPointEnd, segmentPointStart);
    const angle = Math.atan2(dirVec.y, dirVec.x);

    if (angle > Math.PI || angle < -Math.PI) {
        return angle + Math.PI;
    }

    return angle;
}
