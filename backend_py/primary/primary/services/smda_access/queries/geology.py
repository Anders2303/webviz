from typing import List

from webviz_pkg.core_utils.perf_timer import PerfTimer
from ..types import WellboreGeoHeader, WellboreGeoData
from ._get_request import get
from ..utils.queries import data_model_to_projection_param


async def get_wellbore_geology_headers(
    access_token: str,
    wellbore_uuid: str,
) -> List[WellboreGeoHeader]:
    """Returns a list of all lithological and paleogeographical headers for a given wellbore"""

    endpoint = "wellbore-geology-headers"
    projection = WellboreGeoHeader.model_fields.keys()
    params = {
        "_projection": ",".join(projection),
        "_sort": "geol_type,identifier",
        "wellbore_uuid": wellbore_uuid,
    }

    timer = PerfTimer()
    result = await get(access_token=access_token, endpoint=endpoint, params=params)
    parsed_result = [WellboreGeoHeader(**header) for header in result]

    print(f"TIME SMDA fetch wellbore geo headers took {timer.lap_s():.2f} seconds")
    return parsed_result


async def get_wellbore_geology_data(
    access_token: str,
    wellbore_uuid: str,
    geo_header_uuid: str | None = None,
) -> List[WellboreGeoData]:
    """
    Returns all geology data entries for a given wellbore. Can optionally specify a
    wellbore geo header to limit the returned data
    """
    timer = PerfTimer()
    endpoint = "wellbore-geology-data"
    params = {
        "_projection": data_model_to_projection_param(WellboreGeoData),
        "_sort": "unique_wellbore_identifier,top_depth_md",
        "wellbore_uuid": wellbore_uuid,
        "wellbore_geol_header_uuid": geo_header_uuid,
    }

    result = await get(access_token=access_token, endpoint=endpoint, params=params)
    parsed_result = [WellboreGeoData(**header) for header in result]

    print(f"TIME SMDA fetch wellbore geo data took {timer.lap_s():.2f} seconds")
    return parsed_result
