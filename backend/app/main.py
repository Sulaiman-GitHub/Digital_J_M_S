from fastapi import APIRouter, FastAPI
from slowapi.errors import RateLimitExceeded

from app.api.routes import (
    account,
    admin_employers,
    admin_reports,
    admin_vacancies,
    applications,
    auth,
    consents,
    cv,
    employer,
    employer_vacancies,
    health,
    images,
    profile,
    reference,
    reports,
    saved_vacancies,
    test_support,
    vacancies,
)
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.http_safety import BodySizeLimitMiddleware, SecurityHeadersMiddleware
from app.core.logging import RequestIdMiddleware, configure_logging
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.core.upload_limit import UploadSizeLimitMiddleware

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    # Load settings first so a bad configuration fails at startup, not on first use.
    settings = get_settings()
    configure_logging()

    app = FastAPI(
        title="Digital Job Matching System API",
        version="0.1.0",
        # The interactive docs are for development; production does not publish them.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    # Outermost first: headers on every response (refusals too), then the size limit.
    app.add_middleware(
        BodySizeLimitMiddleware,
        exempt_paths=(f"{API_PREFIX}/cv/me", f"{API_PREFIX}/photo/me", f"{API_PREFIX}/logo/me"),
    )
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
    # Added before RequestIdMiddleware so that one is outermost and tags every response.
    app.add_middleware(
        UploadSizeLimitMiddleware,
        path=f"{API_PREFIX}/cv/me",
        method="POST",
        max_file_bytes=lambda: get_settings().max_cv_bytes,
    )
    for image_path in ("photo", "logo"):
        app.add_middleware(
            UploadSizeLimitMiddleware,
            path=f"{API_PREFIX}/{image_path}/me",
            method="POST",
            max_file_bytes=lambda: get_settings().max_image_bytes,
        )
    app.add_middleware(RequestIdMiddleware)
    register_exception_handlers(app)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    api_router = APIRouter(prefix=API_PREFIX)
    api_router.include_router(health.router)
    api_router.include_router(images.router)
    api_router.include_router(account.router)
    api_router.include_router(admin_employers.router)
    api_router.include_router(admin_reports.router)
    api_router.include_router(admin_vacancies.router)
    api_router.include_router(applications.router)
    api_router.include_router(auth.router)
    api_router.include_router(consents.router)
    api_router.include_router(cv.router)
    api_router.include_router(employer.router)
    api_router.include_router(employer_vacancies.router)
    api_router.include_router(profile.router)
    api_router.include_router(reference.router)
    api_router.include_router(reports.router)
    api_router.include_router(saved_vacancies.router)
    api_router.include_router(vacancies.router)
    if settings.app_env == "test":
        # End-to-end test helpers (read the emails the app sent). Never registered elsewhere.
        api_router.include_router(test_support.router)
    app.include_router(api_router)

    return app


app = create_app()
