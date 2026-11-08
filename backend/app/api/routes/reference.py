"""Public reference lists. No login: dropdown data is not private.

Responses are cacheable for an hour and carry an ETag, so a browser that already has a list
gets a tiny 304 instead of the whole list again (low-data users).
"""

import hashlib
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from app.api.deps import DbSession
from app.schemas.common import DataResponse, error_responses
from app.schemas.reference import (
    DistrictOut,
    FieldOfStudyOut,
    InstitutionOut,
    QualificationLevelOut,
    SkillOut,
)
from app.services import reference as reference_service
from app.services.reference import SKILL_QUERY_MAX_LENGTH

router = APIRouter(prefix="/reference", tags=["reference"])

CACHE_CONTROL = "public, max-age=3600"
NOT_MODIFIED = {304: {"description": "The list has not changed since the ETag you sent."}}


def _matches(if_none_match: str | None, etag: str) -> bool:
    if not if_none_match:
        return False
    wanted = [tag.strip().removeprefix("W/") for tag in if_none_match.split(",")]
    return "*" in wanted or etag in wanted


def cached_response(request: Request, payload: DataResponse) -> Response:  # type: ignore[type-arg]
    """The list as JSON with Cache-Control and an ETag; 304 when the client already has it."""
    body = payload.model_dump_json()
    etag = f'"{hashlib.sha256(body.encode()).hexdigest()[:32]}"'
    headers = {"Cache-Control": CACHE_CONTROL, "ETag": etag}
    if _matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


@router.get("/districts", response_model=DataResponse[list[DistrictOut]], responses=NOT_MODIFIED)
def districts(request: Request, db: DbSession) -> Response:
    rows = reference_service.list_districts(db)
    return cached_response(
        request, DataResponse(data=[DistrictOut.model_validate(r) for r in rows])
    )


@router.get(
    "/qualification-levels",
    response_model=DataResponse[list[QualificationLevelOut]],
    responses=NOT_MODIFIED,
)
def qualification_levels(request: Request, db: DbSession) -> Response:
    rows = reference_service.list_qualification_levels(db)
    return cached_response(
        request, DataResponse(data=[QualificationLevelOut.model_validate(r) for r in rows])
    )


@router.get(
    "/institutions", response_model=DataResponse[list[InstitutionOut]], responses=NOT_MODIFIED
)
def institutions(request: Request, db: DbSession) -> Response:
    rows = reference_service.list_institutions(db)
    return cached_response(
        request, DataResponse(data=[InstitutionOut.model_validate(r) for r in rows])
    )


@router.get(
    "/fields-of-study",
    response_model=DataResponse[list[FieldOfStudyOut]],
    responses=NOT_MODIFIED,
)
def fields_of_study(request: Request, db: DbSession) -> Response:
    rows = reference_service.list_fields_of_study(db)
    return cached_response(
        request, DataResponse(data=[FieldOfStudyOut.model_validate(r) for r in rows])
    )


@router.get(
    "/skills",
    response_model=DataResponse[list[SkillOut]],
    responses={**NOT_MODIFIED, **error_responses(422)},
)
def skills(
    request: Request,
    db: DbSession,
    q: Annotated[
        str | None,
        Query(max_length=SKILL_QUERY_MAX_LENGTH, description="Part of a skill name (any case)"),
    ] = None,
) -> Response:
    """Autocomplete: at most 20 active skills containing `q`, names that start with it first."""
    rows = reference_service.search_skills(db, q)
    return cached_response(request, DataResponse(data=[SkillOut.model_validate(r) for r in rows]))
