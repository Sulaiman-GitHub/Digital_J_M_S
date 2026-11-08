import uuid

from pydantic import BaseModel, ConfigDict

from app.models import InstitutionType


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DistrictOut(_Out):
    id: uuid.UUID
    name: str
    region: str


class QualificationLevelOut(_Out):
    id: uuid.UUID
    name: str
    rank: int


class InstitutionOut(_Out):
    id: uuid.UUID
    name: str
    institution_type: InstitutionType
    district_id: uuid.UUID | None


class FieldOfStudyOut(_Out):
    id: uuid.UUID
    name: str


class SkillOut(_Out):
    id: uuid.UUID
    name: str
