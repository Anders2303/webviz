import { apiService } from "@framework/ApiService";
import { DEFAULT_OPTIONS } from "@modules/WellLogViewer/view/queries/shared";

export function getWellborePicksAndStratigraphicUnits(wellboreUuid: string, caseId: string) {
    return {
        queryKey: ["getWellborePicksAndStratigraphicUnits", wellboreUuid, caseId],
        enabled: Boolean(caseId && wellboreUuid),
        queryFn: () => apiService.well.getWellborePicksAndStratigraphicUnits(caseId, wellboreUuid),
        ...DEFAULT_OPTIONS,
    };
}
