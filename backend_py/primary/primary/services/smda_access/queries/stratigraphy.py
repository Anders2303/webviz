from webviz_pkg.core_utils.perf_timer import PerfTimer
from ._get_request import get_aggregations


async def get_strat_unit_types_for_wellbore(
    access_token: str,
    wellbore_uuid: str,
) -> list[str]:
    """Get a list of all stratigraphic unit types (group, formation, subzone, etc...) that are present for a given wellbore"""

    endpoint = "wellbore-stratigraphy"

    params = {"wellbore_uuid": wellbore_uuid, "_aggregation": "strat_unit_type"}
    timer = PerfTimer()

    data = await get_aggregations(access_token, endpoint, params)

    types = map(lambda entry: entry["key"], data["strat_unit_type_count"]["buckets"])

    print(f"TIME SMDA fetch wellbore geo headers took {timer.lap_s():.2f} seconds")

    return list(types)
