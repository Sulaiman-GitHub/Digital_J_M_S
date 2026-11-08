"""Demo employers and vacancies for building and testing the screens.

Development only. Every row it creates hangs off a demo user whose email ends in
@demo.example.test, so `reset_demo` removes exactly those rows and nothing else (deleting the user
cascades to its company, vacancies and requirements). Names and places are fictional samples.
"""

import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    District,
    Employer,
    EmploymentType,
    QualificationLevel,
    RequirementKind,
    Skill,
    User,
    UserRole,
    Vacancy,
    VacancyRequirement,
    VacancyStatus,
    VerificationStatus,
    WorkArrangement,
)

DEMO_EMAIL_DOMAIN = "demo.example.test"
ALLOWED_ENVIRONMENTS = frozenset({"development", "test"})

COMPANIES = [
    "Ssese Foods Ltd",
    "Gulu Hardware",
    "Nile Basin Logistics",
    "Kampala Digital Works",
    "Mbarara Dairy Cooperative",
    "Lake Victoria Hotels",
    "Rwenzori Coffee Exporters",
    "Jinja Textile Mills",
    "Arua Community Clinic",
    "Entebbe Air Services",
    "Masaka Builders",
    "Mbale Agro Supplies",
    "Fort Portal Tea Estates",
    "Lira Solar Systems",
    "Soroti Print House",
]

# (title, a sentence of description). Searchable words are repeated across jobs on purpose.
JOBS = [
    (
        "Accounts Assistant",
        "Prepare invoices, reconcile bank statements and support month-end accounts.",
    ),
    (
        "Senior Accountant",
        "Lead the accounting team, prepare financial statements and manage audits.",
    ),
    (
        "Sales Representative",
        "Visit shops and distributors, take orders and grow sales in your area.",
    ),
    ("Marketing Intern", "Help plan social media campaigns and write content for our brands."),
    ("Software Developer", "Build and maintain web applications with Python and JavaScript."),
    ("Data Entry Clerk", "Enter records accurately into our systems and keep files in order."),
    ("Customer Care Officer", "Answer customer calls and messages and solve problems politely."),
    ("Delivery Driver", "Deliver goods on time and keep the vehicle clean and safe."),
    ("Warehouse Assistant", "Receive, store and dispatch stock and keep the warehouse tidy."),
    ("Nurse", "Care for patients, give medicines and keep clear records."),
    ("Laboratory Technician", "Run tests, record results and keep the laboratory clean."),
    ("Primary School Teacher", "Teach lower primary classes and prepare lessons and assessments."),
    ("Secondary School Teacher", "Teach science subjects and mark continuous assessments."),
    ("Civil Engineer", "Supervise construction sites, read drawings and manage contractors."),
    ("Site Supervisor", "Oversee daily work on building sites and report progress."),
    ("Electrician", "Install and repair electrical systems in homes and businesses."),
    ("Solar Technician", "Install solar panels and batteries and train customers to use them."),
    ("Hotel Receptionist", "Welcome guests, manage bookings and handle payments."),
    ("Chef", "Prepare meals to a high standard and manage the kitchen team."),
    ("Waiter", "Serve guests politely and keep tables clean."),
    ("Human Resources Officer", "Handle recruitment, contracts and staff records."),
    ("Administrative Assistant", "Answer calls, manage diaries and prepare documents."),
    ("Graphic Designer", "Design posters, social media images and printed materials."),
    ("Journalist", "Research and write news stories for print and radio."),
    ("Agricultural Extension Officer", "Train farmers on better crop and livestock practices."),
    ("Veterinary Assistant", "Help treat animals and advise farmers on animal health."),
    ("Procurement Officer", "Prepare tenders, compare quotations and manage suppliers."),
    ("Security Guard", "Guard the premises, check visitors and write incident reports."),
    ("Cashier", "Handle payments, issue receipts and balance the till daily."),
    ("Project Assistant", "Support project teams with reports, schedules and field visits."),
]
LEVELS_BY_TITLE_HINT = {"Senior": 4, "Engineer": 3, "Accountant": 3, "Developer": 3, "Nurse": 2}
CERTIFICATIONS = ["CPA Part 1", "ACCA", "Driving permit", "First aid certificate", "Food handling"]
OTHER_REQUIREMENTS = [
    "Own motorbike",
    "Good communication",
    "Able to work weekends",
    "Fluent in Luganda",
]


class DemoSeedError(Exception):
    """A refusal with a message that is safe to print."""


@dataclass(frozen=True)
class DemoResult:
    employers: int
    vacancies: int
    live: int
    expired: int
    drafts: int
    closed: int


def ensure_allowed(app_env: str) -> None:
    if app_env not in ALLOWED_ENVIRONMENTS:
        raise DemoSeedError(
            f"Demo data is for development only (APP_ENV is {app_env!r}). Nothing was changed."
        )


def demo_users_query():
    return select(User).where(User.email_normalized.like(f"%@{DEMO_EMAIL_DOMAIN}"))


def has_demo(db: Session) -> bool:
    return db.scalar(select(func.count()).select_from(demo_users_query().subquery())) not in (
        0,
        None,
    )


def reset_demo(db: Session) -> int:
    """Remove the demo users and, by cascade, their companies, vacancies and requirements."""
    removed = db.execute(
        delete(User).where(User.email_normalized.like(f"%@{DEMO_EMAIL_DOMAIN}"))
    ).rowcount
    db.flush()
    return removed


def _requirements(
    rng: random.Random, vacancy_id: uuid.UUID, skills: list[Skill]
) -> list[VacancyRequirement]:
    items: list[VacancyRequirement] = []
    chosen = rng.sample(skills, k=min(len(skills), rng.randint(0, 3))) if skills else []
    for skill in chosen:
        items.append(
            VacancyRequirement(
                id=uuid.uuid4(),
                vacancy_id=vacancy_id,
                kind=RequirementKind.SKILL,
                skill_id=skill.id,
                label=skill.name,
                is_mandatory=rng.random() < 0.5,
            )
        )
    if rng.random() < 0.4:
        items.append(
            VacancyRequirement(
                id=uuid.uuid4(),
                vacancy_id=vacancy_id,
                kind=RequirementKind.CERTIFICATION,
                label=rng.choice(CERTIFICATIONS),
                is_mandatory=rng.random() < 0.3,
            )
        )
    if rng.random() < 0.3:
        items.append(
            VacancyRequirement(
                id=uuid.uuid4(),
                vacancy_id=vacancy_id,
                kind=RequirementKind.OTHER,
                label=rng.choice(OTHER_REQUIREMENTS),
                is_mandatory=False,
            )
        )
    return items


def seed_demo(
    db: Session,
    *,
    employers: int = 12,
    vacancies: int = 200,
    rng_seed: int = 42,
    now: datetime | None = None,
) -> DemoResult:
    """Create demo companies (approved) and varied vacancies: mostly live, some expired, draft or
    closed so that the public screens can be checked against rows they must hide."""
    now = now or datetime.now(UTC)
    rng = random.Random(rng_seed)
    districts = list(db.scalars(select(District)))
    if not districts:
        raise DemoSeedError("Load the reference data first (scripts/seed_reference.py).")
    levels = list(db.scalars(select(QualificationLevel).order_by(QualificationLevel.rank)))
    skills = list(db.scalars(select(Skill).where(Skill.is_active)))
    if has_demo(db):
        raise DemoSeedError("Demo data already exists. Run with --reset to replace it.")

    companies: list[Employer] = []
    for number in range(employers):
        email = f"employer{number + 1}@{DEMO_EMAIL_DOMAIN}"
        user = User(
            email=email,
            email_normalized=email,
            password_hash=None,  # nobody logs in as a demo employer
            role=UserRole.EMPLOYER,
            email_verified_at=now,
        )
        db.add(user)
        db.flush()
        employer = Employer(
            owner_user_id=user.id,
            company_name=f"{COMPANIES[number % len(COMPANIES)]}"
            + ("" if number < len(COMPANIES) else f" {number // len(COMPANIES) + 1}"),
            registration_number=f"8002{rng.randint(1000000, 9999999)}",
            contact_phone="+256414000000",
            district_id=rng.choice(districts).id,
            description="A demo company used for building the screens.",
            verification_status=VerificationStatus.APPROVED,
            submitted_at=now - timedelta(days=100),
            decided_at=now - timedelta(days=99),
        )
        db.add(employer)
        companies.append(employer)
    db.flush()

    counts = {"live": 0, "expired": 0, "drafts": 0, "closed": 0}
    for _ in range(vacancies):
        title, sentence = rng.choice(JOBS)
        prefix = rng.choice(["", "", "", "Junior ", "Senior ", "Trainee "])
        title = f"{prefix}{title}".strip()
        arrangement = rng.choices(list(WorkArrangement), weights=[70, 15, 15])[0]
        employment = rng.choices(list(EmploymentType), weights=[50, 15, 15, 15, 5])[0]
        min_level = None
        if levels and rng.random() < 0.7:
            wanted = next(
                (rank for hint, rank in LEVELS_BY_TITLE_HINT.items() if hint in title), None
            )
            pool = [lvl for lvl in levels if wanted is None or lvl.rank <= wanted]
            min_level = rng.choice(pool or levels)
        salary_min = salary_max = None
        if rng.random() < 0.6:
            salary_min = rng.choice([300, 500, 800, 1000, 1500, 2500]) * 1000
            salary_max = salary_min + rng.choice([0, 200, 500, 1000]) * 1000
        roll = rng.random()
        status, published_at, expires_at = VacancyStatus.PUBLISHED, None, None
        if roll < 0.80:  # live
            published_at = now - timedelta(days=rng.uniform(0, 45), hours=rng.uniform(0, 12))
            latest = published_at + timedelta(days=90)
            expires_at = now + timedelta(days=rng.uniform(2, min(60, (latest - now).days)))
            counts["live"] += 1
        elif roll < 0.88:  # expired but still marked published
            published_at = now - timedelta(days=rng.uniform(100, 140))
            expires_at = published_at + timedelta(days=rng.uniform(30, 85))
            counts["expired"] += 1
        elif roll < 0.95:  # drafts, some unfinished
            status = VacancyStatus.DRAFT
            counts["drafts"] += 1
        else:
            status = VacancyStatus.CLOSED
            published_at = now - timedelta(days=rng.uniform(10, 60))
            expires_at = published_at + timedelta(days=rng.uniform(20, 80))
            counts["closed"] += 1

        company = rng.choice(companies)
        district_id = None if arrangement == WorkArrangement.REMOTE else rng.choice(districts).id
        unfinished = status == VacancyStatus.DRAFT and rng.random() < 0.5
        vacancy = Vacancy(
            id=uuid.uuid4(),
            employer_id=company.id,
            title=title,
            description=None if unfinished else f"{sentence} {company.company_name} is hiring.",
            employment_type=None if unfinished else employment,
            work_arrangement=None if unfinished else arrangement,
            district_id=None if unfinished else district_id,
            min_qualification_level_id=min_level.id if min_level else None,
            min_experience_years=rng.choice([0, 0, 1, 2, 3, 5]),
            salary_min=salary_min,
            salary_max=salary_max,
            show_salary=salary_min is not None and rng.random() < 0.5,
            status=status,
            published_at=published_at,
            expires_at=expires_at,
        )
        db.add(vacancy)
        db.flush()
        for requirement in _requirements(rng, vacancy.id, skills):
            db.add(requirement)
    db.flush()
    return DemoResult(
        employers=employers,
        vacancies=vacancies,
        live=counts["live"],
        expired=counts["expired"],
        drafts=counts["drafts"],
        closed=counts["closed"],
    )
