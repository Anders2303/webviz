from typing import List

from .queries.get_stratigraphic_units import get_stratigraphic_units
from .queries.stratigraphy import get_strat_unit_types_for_wellbore
from .types import StratigraphicUnit


class StratigraphyAccess:
    def __init__(self, access_token: str):
        self._smda_token = access_token

    async def get_stratigraphic_units(self, stratigraphic_column_identifier: str) -> List[StratigraphicUnit]:
        """Get stratigraphic units for a given stratigraphic column"""
        return await get_stratigraphic_units(self._smda_token, stratigraphic_column_identifier)

    async def get_strat_unit_types_for_wellbore(self, wellbore_uuid: str) -> List[str]:
        """Fetches a list of all available stratigraphic unit types, given a specific wellbore"""
        return await get_strat_unit_types_for_wellbore(self._smda_token, wellbore_uuid)
