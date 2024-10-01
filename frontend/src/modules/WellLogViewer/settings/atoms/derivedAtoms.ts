import { WellboreHeader_api, WellboreLogCurveHeader_api } from "@api";
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
    wellborePicksAndStratigraphyQueryAtom,
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
    const wellborePicks = get(wellborePicksAndStratigraphyQueryAtom)?.data;
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

export const groupedCurveHeadersAtom = atom<Dictionary<WellboreLogCurveHeader_api[]>>((get) => {
    const logCurveHeaders = get(wellLogCurveHeadersQueryAtom)?.data ?? [];

    return _.groupBy(logCurveHeaders, "logName");
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

type PossibleCurveGroups = Required<TemplatePlotConfig>["_source"];

export const plotConfigsBySourceAtom = atom((get) => {
    const templateConfig = get(logViewerTrackConfigs);

    const curveGroups: Record<PossibleCurveGroups, TemplatePlotConfig[]> = {
        geology: [],
        welllog: [],
        stratigraphy: [],
    };

    // TODO: welllog entry gets weird garbage-entries
    templateConfig.forEach((track) => {
        const trackCurves = _.groupBy(track.plots, "_source");
        _.merge(curveGroups, trackCurves);
    });

    return curveGroups;
});

export const allSelectedGeologyCurvesAtom = atom<TemplatePlotConfig[]>((get) => {
    const geolPlots = get(plotConfigsBySourceAtom).geology;

    return _.chain(geolPlots).filter("_isValid").uniqBy("_sourceId").value();
});

export const allSelectedWellLogCurvesAtom = atom<string[]>((get): string[] => {
    const welllogPlots = get(plotConfigsBySourceAtom).welllog;

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
