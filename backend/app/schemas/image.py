"""What the API says about an uploaded picture. Never the storage key or path."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content_type: str
    size_bytes: int
    created_at: datetime
