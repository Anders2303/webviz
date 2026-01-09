import * as vec2 from "@lib/utils/vec2";
import * as vec3 from "@lib/utils/vec3";
import type { Color, PropertyDataType } from "@webviz/subsurface-viewer";

import { getMd } from "../../WellsLayer/_private/wellTrajectoryUtils";
import type { WellboreMarkerFeature, WellboreTrajectory, WellboreTrajectoryFeature } from "../types";

const STATUS_COLOR_MAP: Record<string, Color> = {
    closed: [148, 25, 25],
    open: [76, 53, 189],
    operating: [41, 180, 73],
};

export function buildMarkerReadout(marker: WellboreMarkerFeature): PropertyDataType | undefined {
    switch (marker.properties.type) {
        case "perforation":
            return {
                name: "Perforation",
                value: marker.properties.status,
                color: STATUS_COLOR_MAP[marker.properties.status],
            };
        default:
            return undefined;
    }
}

export function buildTrajectoryReadout(
    trajectoryFeature: WellboreTrajectory,
    pointerCoordinate: number[],
): PropertyDataType | undefined {
    const uwi = trajectoryFeature.properties.identifier;
    const mdArr = trajectoryFeature.properties.mdArr;

    let mdValue;
    let tvdValue;

    if (pointerCoordinate.length === 3) {
        const vectorPath = trajectoryFeature.path.map(vec3.fromArray);
        const vectorCoord = vec3.fromArray(pointerCoordinate);

        mdValue = 
    } else {
        // It's implicitly 2D here
        const vectorPath = trajectoryFeature.path.map(vec2.vec2FromArray);
        const vectorCoord = vec2.vec2FromArray(pointerCoordinate);

        mdValue = 
    }

    const vectorPath = trajectoryFeature.path.map((pos) => vec3.fromArray(pos));
    const vectorCoord = fromArray(pointerCoordinate);
    const coordinateMd = getMd(vectorCoord, mdArr, vectorPath);

    return {
        name: `MD ${uwi}`,
        value: coordinateMd ?? "?",
    };
}

// export function buildWellboreDataReadout();
