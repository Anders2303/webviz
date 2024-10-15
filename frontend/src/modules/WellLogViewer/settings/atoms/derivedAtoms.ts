import {
    StratigraphicUnit_api,
    WellLogCurveSourceEnum_api,
    WellLogCurveTypeEnum_api,
    WellboreHeader_api,
    WellboreLogCurveHeader_api,
} from "@api";
import { transformFormationData } from "@equinor/esv-intersection";
import { EnsembleSetAtom } from "@framework/GlobalAtoms";
import { WellPicksLayerData } from "@modules/Intersection/utils/layers/WellpicksLayer";
import { TemplatePlot, TemplateTrack } from "@webviz/well-log-viewer/dist/components/WellLogTemplateTypes";

import { atom } from "jotai";
import _, { Dictionary } from "lodash";

import {
    userSelectedFieldIdentifierAtom,
    userSelectedNonUnitWellpicksAtom,
    userSelectedUnitWellpicksAtom,
    userSelectedWellboreUuidAtom,
} from "./baseAtoms";
import { TemplatePlotConfig, logViewerTrackConfigs } from "./persistedAtoms";
import {
    drilledWellboreHeadersQueryAtom,
    wellLogCurveHeadersQueryAtom,
    wellborePicksAndStratUnitsQueryAtom,
} from "./queryAtoms";

export const selectedEnsembleSetAtom = atom((get) => {
    const ensembleSetArr = get(EnsembleSetAtom).getEnsembleArr();
    const selectedFieldId = get(userSelectedFieldIdentifierAtom);

    if (ensembleSetArr.length < 1) {
        return null;
    } else {
        const selectedEnsemble = ensembleSetArr.find((e) => e.getFieldIdentifier() === selectedFieldId);

        return selectedEnsemble ?? ensembleSetArr[0];
    }
});

export const selectedFieldIdentifierAtom = atom((get) => {
    return get(selectedEnsembleSetAtom)?.getFieldIdentifier() ?? null;
});

export const selectedWellboreAtom = atom<WellboreHeader_api | null>((get) => {
    const availableWellboreHeaders = get(drilledWellboreHeadersQueryAtom)?.data;
    const selectedWellboreId = get(userSelectedWellboreUuidAtom);

    return getSelectedWellboreHeader(selectedWellboreId, availableWellboreHeaders);
});

export const selectedWellborePicksAtom = atom<WellPicksLayerData>((get) => {
    const wellborePicks = get(availableWellPicksAtom);
    const selectedUnitPicks = get(userSelectedUnitWellpicksAtom);
    const selectedNonUnitPicks = get(userSelectedNonUnitWellpicksAtom);

    if (!wellborePicks) return { unitPicks: [], nonUnitPicks: [] };
    else {
        const unitPicks = wellborePicks.unitPicks.filter((pick) => selectedUnitPicks.includes(pick.name));
        const nonUnitPicks = wellborePicks.nonUnitPicks.filter((pick) =>
            selectedNonUnitPicks.includes(pick.identifier)
        );

        return { unitPicks, nonUnitPicks };
    }
});

export const availableContinuousCurvesAtom = atom((get) => {
    const logCurveHeaders = get(wellLogCurveHeadersQueryAtom)?.data ?? [];

    return _.filter(logCurveHeaders, ["curveType", WellLogCurveTypeEnum_api.CONTINUOUS]);
});

export const availableDiscreteCurvesAtom = atom((get) => {
    const logCurveHeaders = get(wellLogCurveHeadersQueryAtom)?.data ?? [];

    return _.filter(logCurveHeaders, ["curveType", WellLogCurveTypeEnum_api.DISCRETE]);
});

export const availableFlagCurvesAtom = atom((get) => {
    const logCurveHeaders = get(wellLogCurveHeadersQueryAtom)?.data ?? [];

    return _.filter(logCurveHeaders, ["curveType", WellLogCurveTypeEnum_api.FLAG]);
});

export const groupedCurveHeadersAtom = atom<Dictionary<WellboreLogCurveHeader_api[]>>((get) => {
    const logCurveHeaders = get(wellLogCurveHeadersQueryAtom)?.data ?? [];

    return _.groupBy(logCurveHeaders, "logName");
});

export type WellPicksLayerDataAndUnits = WellPicksLayerData & { stratUnits: StratigraphicUnit_api[] };

export const availableWellPicksAtom = atom<WellPicksLayerDataAndUnits>((get) => {
    const wellborePicksAndStratUnits = get(wellborePicksAndStratUnitsQueryAtom)?.data;

    if (!wellborePicksAndStratUnits) return { nonUnitPicks: [], unitPicks: [], stratUnits: [] };

    const { stratigraphic_units, wellbore_picks } = wellborePicksAndStratUnits;

    // ! transformFormationData mutates the data object, so need to make a copy!
    const stratUnits = [...stratigraphic_units];
    const transformedData = transformFormationData(wellbore_picks, stratigraphic_units as any);

    return {
        // ! Sometimes the transformation data returns duplicate entries, so need to de-dupe
        nonUnitPicks: _.uniqBy(transformedData.nonUnitPicks, "identifier"),
        unitPicks: _.uniqBy(transformedData.unitPicks, "name"),
        stratUnits,
    };
});

export const wellLogTemplateTracks = atom<TemplateTrack[]>((get) => {
    const templateTrackConfigs = get(logViewerTrackConfigs);

    return templateTrackConfigs.map((config): TemplateTrack => {
        return {
            ...config,
            plots: config.plots.filter(({ _isValid }) => _isValid) as TemplatePlot[],
        };
    });
});

type PossibleCurveGroups = WellLogCurveSourceEnum_api;

export const plotConfigsBySourceAtom = atom((get) => {
    const templateConfig = get(logViewerTrackConfigs);

    const curveGroups: Record<PossibleCurveGroups, TemplatePlotConfig[]> = {
        "smda::geology": [],
        "smda::stratigraphy": [],
        "ssdl::well_log": [],
    };

    templateConfig.forEach((track) => {
        const trackCurves = _.groupBy(track.plots, "_source");
        _.mergeWith(curveGroups, trackCurves, (n, s) => {
            if (_.isArray(n)) return n.concat(s);
        });
    });

    return curveGroups;
});

export const allSelectedGeologyCurvesAtom = atom<TemplatePlotConfig[]>((get) => {
    const geolPlots = get(plotConfigsBySourceAtom)["smda::geology"];

    return _.chain(geolPlots).filter("_isValid").uniqBy("_sourceId").value();
});

export const allSelectedStratigraphyCurves = atom<TemplatePlotConfig[]>((get) => {
    const geolPlots = get(plotConfigsBySourceAtom)["smda::stratigraphy"];

    return _.chain(geolPlots).filter("_isValid").uniqBy("_sourceId").value();
});

export const allSelectedWellLogCurvesAtom = atom<string[]>((get): string[] => {
    const welllogPlots = get(plotConfigsBySourceAtom)["ssdl::well_log"];

    return _.chain(welllogPlots)
        .flatMap(({ name, name2, _isValid }) => {
            if (!_isValid || !name) return [];
            else if (name2) return [name, name2];
            else return [name];
        })
        .uniq()
        .value();
});

function getSelectedWellboreHeader(
    currentId: string | null,
    wellboreHeaderSet: WellboreHeader_api[] | null | undefined
): WellboreHeader_api | null {
    if (!wellboreHeaderSet || wellboreHeaderSet.length < 1) {
        return null;
    }

    if (!currentId) {
        return wellboreHeaderSet[0];
    }

    return wellboreHeaderSet.find((wh) => wh.wellboreUuid === currentId) ?? wellboreHeaderSet[0];
}
