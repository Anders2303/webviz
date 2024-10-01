"""Classes for accessing geology APIs"""

from typing import List

from .queries.geology import get_wellbore_geology_headers, get_wellbore_geology_data
from .types import WellboreGeoHeader, WellboreGeoData


class GeologyAccess:
    """Service class to access SMDA geology endpoints"""

    def __init__(self, access_token: str):
        self._smda_token = access_token

    async def get_wellbore_geol_headers(self, wellbore_uuid: str) -> List[WellboreGeoHeader]:
        """forwards to `.queries.geology.get_wellbore_geology_headers`"""
        return await get_wellbore_geology_headers(self._smda_token, wellbore_uuid)

    async def get_wellbore_geol_data(self, wellbore_uuid: str, geo_header_uuid: str) -> List[WellboreGeoData]:
        """forwards to `.queries.geology.get_wellbore_geology_data`"""
        return await get_wellbore_geology_data(self._smda_token, wellbore_uuid, geo_header_uuid)
