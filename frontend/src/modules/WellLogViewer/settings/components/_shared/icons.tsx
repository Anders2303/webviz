import { ShowChart, ViewDay } from "@mui/icons-material";

import { TemplateTrackConfig } from "../../atoms/persistedAtoms";
import { WellLogCurveTypeEnum_api } from "@api";

export function TrackIcon(props: { type: TemplateTrackConfig["_type"] }) {
    if (props.type === WellLogCurveTypeEnum_api.CONTINUOUS) return <ShowChart fontSize="inherit" />;
    else return <ViewDay fontSize="inherit" />;
}
