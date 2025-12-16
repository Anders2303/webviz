import type { Position as GLPosition } from "@deck.gl/core";
import type { Feature, LineString, Geometry } from "geojson";

export type WellboreTrajectoryFeature = Feature<LineString, WellboreProperties>;
export type WellboreMarkerFeature = Feature<Geometry, WellboreMarkerProperties>;

export type WellboreMarkerProperties = {
    uuid: string;
    identifier: string;
    purpose: string;
    status: string;
    type: "perforation" | "screen";
    md: number;
    tvd: number;
    segment: string;
};

export type WellboreProperties = {
    uuid: string;
    identifier: string;
    purpose: string;
    status: string;
    mdArr: number[];
    tvdArr: number[];
    // TODO: This migth not fit how we want to do segments
    segmentArr: string[];
};

export type WellboreData = {
    uniqueIdentifier: string;
    uuid: string;
    purpose: string;
    status: string;
    well: WellData;
    perforations: PerforationData[];
    screens: WellboreScreenData[];
    formationSegments: FormationSegmentData[];
    trajectory: WellboreDataTrajectory;
};

export type WellData = {
    uuid: string;
    uniqueIdentifier: string;
    easting: number;
    northing: number;
};

export type WellboreTrajectory = {
    properties: WellboreProperties;
    path: GLPosition[];
    dashedMdIntervals?: [from: number, to: number][];
};

export type PerforationData = {
    mdTop: number;
    mdBottom: number;
    tvdTop: number;
    tvdBottom: number;
    status: string;
    completionMode: string;
    dateShot: string | null;
    dateClosed: string | null;
};

export type WellboreScreenData = {
    mdTop: number;
    mdBottom: number;
    symbolName: string | null;
    description: string | null;
    comment: string | null;
};

export type FormationSegmentData = {
    segmentIdent: string;
    mdEnter: number;
    mdExit: number;
};

export type WellboreDataTrajectory = {
    mdArr: Array<number>;
    tvdMslArr: Array<number>;
    eastingArr: Array<number>;
    northingArr: Array<number>;
};
