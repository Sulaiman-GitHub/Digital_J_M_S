import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CvOut(BaseModel):
    """What a client may know about its CV: no storage key, no hash, no path."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime
