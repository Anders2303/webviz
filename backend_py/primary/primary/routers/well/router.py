import logging
from typing import List, Union

from fastapi import APIRouter, Depends, Query

from primary.services.smda_access.mocked_drogon_smda_access import (
    WellAccess as MockedSmdaWellAccess,
    StratigraphyAccess as MockedStratigraphyAccess,
)
from primary.services.smda_access.well_access import WellAccess as SmdaWellAccess
from primary.services.smda_access.geology_access import GeologyAccess as SmdaGeologyAccess
from primary.services.smda_access.stratigraphy_access import StratigraphyAccess

from primary.services.utils.authenticated_user import AuthenticatedUser
from primary.auth.auth_helper import AuthHelper
from primary.services.sumo_access.case_inspector import CaseInspector

from primary.services.ssdl_access.well_access import WellAccess as SsdlWellAccess

from . import schemas
from . import converters

LOGGER = logging.getLogger(__name__)

router = APIRouter()


@router.get("/drilled_wellbore_headers/")
async def get_drilled_wellbore_headers(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    field_identifier: str = Query(description="Sumo field identifier"),
    # Should be field identifier
    # fmt:on
) -> List[schemas.WellboreHeader]:
    """Get wellbore headers for all wells in the field"""
    well_access: Union[SmdaWellAccess, MockedSmdaWellAccess]
    if field_identifier == "DROGON":
        # Handle DROGON
        well_access = MockedSmdaWellAccess(authenticated_user.get_smda_access_token())
    else:
        well_access = SmdaWellAccess(authenticated_user.get_smda_access_token())

    wellbore_headers = await well_access.get_wellbore_headers(field_identifier=field_identifier)

    return [converters.convert_wellbore_header_to_schema(wellbore_header) for wellbore_header in wellbore_headers]


@router.get("/field_well_trajectories/")
async def get_field_well_trajectories(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    field_identifier: str = Query(description="Sumo field identifier"),
    unique_wellbore_identifiers:List[str] =  Query(None, description="Optional subset of well names")
    # fmt:on
) -> List[schemas.WellboreTrajectory]:
    """Get well trajectories for field"""
    well_access: Union[SmdaWellAccess, MockedSmdaWellAccess]
    if field_identifier == "DROGON":
        # Handle DROGON
        well_access = MockedSmdaWellAccess(authenticated_user.get_smda_access_token())
    else:
        well_access = SmdaWellAccess(authenticated_user.get_smda_access_token())

    wellbore_trajectories = await well_access.get_field_wellbore_trajectories(
        field_identifier=field_identifier, unique_wellbore_identifiers=unique_wellbore_identifiers
    )

    return [
        converters.convert_well_trajectory_to_schema(wellbore_trajectory)
        for wellbore_trajectory in wellbore_trajectories
    ]


@router.get("/well_trajectories/")
async def get_well_trajectories(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    wellbore_uuids: List[str] = Query(description="Wellbore uuids"),
    # fmt:on
) -> List[schemas.WellboreTrajectory]:
    """Get well trajectories"""
    well_access: Union[SmdaWellAccess, MockedSmdaWellAccess]

    # Handle DROGON
    if all(x in ["drogon_horizontal", "drogon_vertical"] for x in wellbore_uuids):
        well_access = MockedSmdaWellAccess(authenticated_user.get_smda_access_token())
    else:
        well_access = SmdaWellAccess(authenticated_user.get_smda_access_token())

    wellbore_trajectories = await well_access.get_wellbore_trajectories(wellbore_uuids=wellbore_uuids)

    return [
        converters.convert_well_trajectory_to_schema(wellbore_trajectory)
        for wellbore_trajectory in wellbore_trajectories
    ]


@router.get("/wellbore_picks_and_stratigraphic_units/")
async def get_wellbore_picks_and_stratigraphic_units(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    case_uuid: str = Query(description="Sumo case uuid"), # Should be field identifier?
    wellbore_uuid: str = Query(description="Wellbore uuid"),
    # fmt:on
) -> schemas.WellborePicksAndStratigraphicUnits:
    """Get well bore picks for a single well bore"""
    well_access: Union[SmdaWellAccess, MockedSmdaWellAccess]
    stratigraphy_access: Union[StratigraphyAccess, MockedStratigraphyAccess]

    case_inspector = CaseInspector.from_case_uuid(authenticated_user.get_sumo_access_token(), case_uuid)
    stratigraphic_column_identifier = await case_inspector.get_stratigraphic_column_identifier_async()

    # Handle DROGON
    field_identifiers = await case_inspector.get_field_identifiers_async()
    if "DROGON" in field_identifiers:
        well_access = MockedSmdaWellAccess(authenticated_user.get_smda_access_token())
        stratigraphy_access = MockedStratigraphyAccess(authenticated_user.get_smda_access_token())

    else:
        well_access = SmdaWellAccess(authenticated_user.get_smda_access_token())
        stratigraphy_access = StratigraphyAccess(authenticated_user.get_smda_access_token())

    stratigraphic_units = await stratigraphy_access.get_stratigraphic_units(stratigraphic_column_identifier)
    wellbore_picks = await well_access.get_all_picks_for_wellbore(wellbore_uuid=wellbore_uuid)

    return schemas.WellborePicksAndStratigraphicUnits(
        wellbore_picks=[converters.convert_wellbore_pick_to_schema(wellbore_pick) for wellbore_pick in wellbore_picks],
        stratigraphic_units=[
            converters.convert_stratigraphic_unit_to_schema(stratigraphic_unit)
            for stratigraphic_unit in stratigraphic_units
        ],
    )


@router.get("/wellbore_completions/")
async def get_wellbore_completions(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    wellbore_uuid: str = Query(description="Wellbore uuid"),
    # fmt:on
) -> List[schemas.WellboreCompletion]:
    """Get well bore completions for a single well bore"""

    # Handle DROGON
    if wellbore_uuid in ["drogon_horizontal", "drogon_vertical"]:
        return []

    well_access = SsdlWellAccess(authenticated_user.get_ssdl_access_token())

    wellbore_completions = await well_access.get_completions_for_wellbore(wellbore_uuid=wellbore_uuid)
    return [
        converters.convert_wellbore_completion_to_schema(wellbore_completion)
        for wellbore_completion in wellbore_completions
    ]


@router.get("/wellbore_casings/")
async def get_wellbore_casings(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    wellbore_uuid: str = Query(description="Wellbore uuid"),
    # fmt:on
) -> List[schemas.WellboreCasing]:
    """Get well bore casings for a single well bore"""

    # Handle DROGON
    if wellbore_uuid in ["drogon_horizontal", "drogon_vertical"]:
        return []

    well_access = SsdlWellAccess(authenticated_user.get_ssdl_access_token())

    wellbore_casings = await well_access.get_casings_for_wellbore(wellbore_uuid=wellbore_uuid)

    return [converters.convert_wellbore_casing_to_schema(wellbore_casing) for wellbore_casing in wellbore_casings]


@router.get("/wellbore_perforations/")
async def get_wellbore_perforations(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    wellbore_uuid: str = Query(description="Wellbore uuid"),
    # fmt:on
) -> List[schemas.WellborePerforation]:
    """Get well bore casing for a single well bore"""

    # Handle DROGON
    if wellbore_uuid in ["drogon_horizontal", "drogon_vertical"]:
        return []

    well_access = SsdlWellAccess(authenticated_user.get_ssdl_access_token())

    wellbore_perforations = await well_access.get_perforations_for_wellbore(wellbore_uuid=wellbore_uuid)

    return [
        converters.convert_wellbore_perforation_to_schema(wellbore_perforation)
        for wellbore_perforation in wellbore_perforations
    ]


@router.get("/wellbore_log_curve_headers/")
async def get_wellbore_log_curve_headers(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    wellbore_uuid: str = Query(description="Wellbore uuid"),
    sources: List[schemas.WellLogCurveSourceEnum] = Query(
       description="Sources to fetch well-logs from. ",
       default=[schemas.WellLogCurveSourceEnum.SSDL_WELL_LOG]
    )
    # fmt:on
) -> List[schemas.WellboreLogCurveHeader]:
    """
    Get all log curve headers for a single well bore.
    Logs are available from multiple sources, which can be specificed by the "sources" parameter.
    """

    # Handle DROGON
    if wellbore_uuid in ["drogon_horizontal", "drogon_vertical"]:
        return []

    curve_headers = []

    if schemas.WellLogCurveSourceEnum.SSDL_WELL_LOG in sources:
        curve_headers += await __get_headers_from_ssdl_well_log(authenticated_user, wellbore_uuid)

    if schemas.WellLogCurveSourceEnum.SMDA_GEOLOGY in sources:
        curve_headers += await __get_headers_from_smda_geology(authenticated_user, wellbore_uuid)

    if schemas.WellLogCurveSourceEnum.SMDA_STRATIGRAPHY in sources:
        curve_headers += await __get_headers_from_smda_stratigraghpy(authenticated_user, wellbore_uuid)

    return curve_headers


async def __get_headers_from_ssdl_well_log(authenticated_user: AuthenticatedUser, wellbore_uuid: str):
    well_access = SsdlWellAccess(authenticated_user.get_ssdl_access_token())
    headers = await well_access.get_log_curve_headers_for_wellbore(wellbore_uuid)

    # Missing log name implies garbage data, so we drop them
    valid_headers = filter(lambda header: header.log_name is not None, headers)

    return [converters.convert_wellbore_log_curve_header_to_schema(head) for head in valid_headers]


async def __get_headers_from_smda_geology(authenticated_user: AuthenticatedUser, wellbore_uuid: str):
    geol_access = SmdaGeologyAccess(authenticated_user.get_smda_access_token())
    geo_headers = await geol_access.get_wellbore_geol_headers(wellbore_uuid)

    return [converters.convert_wellbore_geo_header_to_well_log_header(header) for header in geo_headers]


async def __get_headers_from_smda_stratigraghpy(authenticated_user: AuthenticatedUser, wellbore_uuid: str):
    strat_access = StratigraphyAccess(authenticated_user.get_smda_access_token())
    unit_types = await strat_access.get_strat_unit_types_for_wellbore(wellbore_uuid)

    return [converters.convert_strat_unit_type_to_well_log_header(u_type) for u_type in unit_types]


@router.get("/log_curve_data/")
async def get_log_curve_data(
    # fmt:off
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    wellbore_uuid: str = Query(description="Wellbore uuid"),
    log_curve_name:str = Query(description="Log curve name")
    # fmt:on
) -> schemas.WellboreLogCurveData:
    """Get log curve data"""

    # Handle DROGON
    if wellbore_uuid in ["drogon_horizontal", "drogon_vertical"]:
        raise NotImplementedError("DROGON log curve data not implemented")

    well_access = SsdlWellAccess(authenticated_user.get_ssdl_access_token())

    log_curve = await well_access.get_log_curve_data(wellbore_uuid=wellbore_uuid, curve_name=log_curve_name)

    return converters.convert_wellbore_log_curve_data_to_schema(log_curve)


@router.get("/wellbore_geology_headers")
async def get_wellbore_geology_headers(
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    wellbore_uuid: str = Query(description="Wellbore uuid"),
) -> List[schemas.WellboreGeoHeader]:
    """Gets headers for geological interproation data for a given wellbore"""
    # Handle DROGON
    if wellbore_uuid in ["drogon_horizontal", "drogon_vertical"]:
        raise NotImplementedError("DROGON log curve data not implemented")

    geol_access = SmdaGeologyAccess(authenticated_user.get_smda_access_token())
    geo_headers = await geol_access.get_wellbore_geol_headers(wellbore_uuid)

    return [converters.convert_wellbore_geo_header_to_schema(header) for header in geo_headers]


@router.get("/wellbore_geology_data")
async def get_wellbore_geology_data(
    authenticated_user: AuthenticatedUser = Depends(AuthHelper.get_authenticated_user),
    wellbore_uuid: str = Query(description="Wellbore uuid"),
    geology_header_uuid: str = Query(description="Geology header uuid"),
) -> List[schemas.WellboreGeoData]:
    """Gets geological data entries for a given geology header"""

    # Handle DROGON
    if wellbore_uuid in ["drogon_horizontal", "drogon_vertical"]:
        raise NotImplementedError("DROGON log curve data not implemented")

    geol_access = SmdaGeologyAccess(authenticated_user.get_smda_access_token())
    geol_data = await geol_access.get_wellbore_geol_data(wellbore_uuid, geology_header_uuid)

    return [converters.convert_wellbore_geo_data_to_schema(entry) for entry in geol_data]
