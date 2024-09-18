export type AppliedEdges<T> = Record<"left" | "right" | "top" | "bottom", T>;

/**
 * Given an array of length 1-4, returns derived left-right-top-bottom values in the same
 * manner as CSS applies values for padding/margin/inset
 * @param edgeValues An array, no longer than 4 entries.
 * @returns
 */
export function applyCssEdgeOrder<T>(edgeValues: T[]): AppliedEdges<T> {
    switch (edgeValues.length) {
        case 1:
            return {
                top: edgeValues[0],
                right: edgeValues[0],
                bottom: edgeValues[0],
                left: edgeValues[0],
            };
        case 2:
            return {
                top: edgeValues[0],
                right: edgeValues[1],
                bottom: edgeValues[0],
                left: edgeValues[1],
            };
        case 3:
            return {
                top: edgeValues[0],
                right: edgeValues[1],
                bottom: edgeValues[2],
                left: edgeValues[1],
            };
        case 4:
            return {
                top: edgeValues[0],
                right: edgeValues[1],
                bottom: edgeValues[2],
                left: edgeValues[3],
            };
        default:
            throw new Error("Invalid number of edge values");
    }
}
