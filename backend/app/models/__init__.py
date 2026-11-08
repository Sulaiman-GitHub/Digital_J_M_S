"""All SQLAlchemy models. Importing this package registers every table on Base.metadata
(Alembic's env.py relies on that)."""

from app.models.application import Application, ApplicationStatus, ApplicationStatusEvent
from app.models.audit_event import AuditEvent
from app.models.auth_identity import AuthIdentity
from app.models.auth_session import AuthSession
from app.models.consent import Consent, ConsentType
from app.models.cv import Cv
from app.models.email_token import EmailToken, EmailTokenPurpose
from app.models.employer import Employer, EmployerVerificationEvent, VerificationStatus
from app.models.profile import ProfileExperience, ProfileSkill, SeekerProfile, StudyStatus
from app.models.reference import (
    District,
    FieldOfStudy,
    Institution,
    InstitutionType,
    QualificationLevel,
    Skill,
)
from app.models.saved_vacancy import SavedVacancy
from app.models.user import User, UserRole, UserStatus
from app.models.user_image import ImageKind, UserImage
from app.models.vacancy import (
    ApplicationMethod,
    EmploymentType,
    RequirementKind,
    Vacancy,
    VacancyRequirement,
    VacancyStatus,
    WorkArrangement,
)
from app.models.vacancy_report import ReportReason, ReportStatus, VacancyReport

__all__ = [
    "Application",
    "ApplicationStatus",
    "ApplicationStatusEvent",
    "ApplicationMethod",
    "ReportReason",
    "ReportStatus",
    "VacancyReport",
    "AuditEvent",
    "AuthIdentity",
    "AuthSession",
    "Consent",
    "ConsentType",
    "Cv",
    "District",
    "EmailToken",
    "EmailTokenPurpose",
    "Employer",
    "EmployerVerificationEvent",
    "FieldOfStudy",
    "ImageKind",
    "Institution",
    "InstitutionType",
    "ProfileExperience",
    "ProfileSkill",
    "QualificationLevel",
    "SavedVacancy",
    "SeekerProfile",
    "Skill",
    "StudyStatus",
    "User",
    "UserImage",
    "UserRole",
    "UserStatus",
    "VerificationStatus",
    "EmploymentType",
    "RequirementKind",
    "Vacancy",
    "VacancyRequirement",
    "VacancyStatus",
    "WorkArrangement",
]
