from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import Consent, ConsentType


class ConsentIn(BaseModel):
    # Unknown fields are an error: nothing but these two can be sent.
    model_config = ConfigDict(extra="forbid")

    consent_type: ConsentType
    granted: bool


class ConsentOut(BaseModel):
    consent_type: ConsentType
    policy_version: str
    granted_at: datetime

    @classmethod
    def from_consent(cls, consent: Consent) -> "ConsentOut":
        return cls(
            consent_type=consent.consent_type,
            policy_version=consent.policy_version,
            granted_at=consent.granted_at,
        )
