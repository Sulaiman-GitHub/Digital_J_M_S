import uuid

from pydantic import BaseModel


class SavedIds(BaseModel):
    vacancy_ids: list[uuid.UUID]
