"""Auth endpoints. HTTP only: parse input, call the service, shape output."""

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status

from app.api.cookies import clear_auth_cookies, set_auth_cookies
from app.api.deps import (
    CurrentAuth,
    CurrentUser,
    DbSession,
    EmailSenderDep,
    client_ip,
    require_csrf,
)
from app.core.rate_limit import auth_rate_limit, limiter
from app.integrations.email import send_email_safely
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenRequest,
    UserOut,
)
from app.schemas.common import DataResponse, MessageOut, error_responses
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(409, 422, 429),
)
@limiter.limit(auth_rate_limit)
def register(
    request: Request,
    body: RegisterRequest,
    db: DbSession,
    background: BackgroundTasks,
    sender: EmailSenderDep,
) -> DataResponse[UserOut]:
    user, token = auth_service.register_user(
        db, email=body.email, password=body.password, role=body.role
    )
    db.flush()
    db.refresh(user)
    # Background tasks run after the response, i.e. after get_db has committed.
    background.add_task(send_email_safely, sender, auth_service.verification_message(user, token))
    return DataResponse(data=UserOut.from_user(user))


@router.post("/verify-email", responses=error_responses(400, 422, 429))
@limiter.limit(auth_rate_limit)
def verify_email(request: Request, body: TokenRequest, db: DbSession) -> DataResponse[UserOut]:
    user = auth_service.verify_email(db, body.token, ip=client_ip(request))
    return DataResponse(data=UserOut.from_user(user))


@router.post(
    "/resend-verification",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 409, 429),
)
@limiter.limit(auth_rate_limit)
def resend_verification(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    background: BackgroundTasks,
    sender: EmailSenderDep,
) -> DataResponse[MessageOut]:
    token = auth_service.resend_verification(db, user)
    background.add_task(send_email_safely, sender, auth_service.verification_message(user, token))
    return DataResponse(data=MessageOut(message="We sent a new verification link."))


@router.post("/login", responses=error_responses(401, 403, 422, 429))
@limiter.limit(auth_rate_limit)
def login(
    request: Request, response: Response, body: LoginRequest, db: DbSession
) -> DataResponse[UserOut]:
    result = auth_service.authenticate(
        db,
        email=body.email,
        password=body.password,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_auth_cookies(response, result.session_token, result.csrf_token, result.expires_at)
    return DataResponse(data=UserOut.from_user(result.user))


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403),
)
def logout(auth: CurrentAuth) -> Response:
    auth_service.logout(auth.session)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response)
    return response


@router.post(
    "/forgot-password",
    status_code=status.HTTP_202_ACCEPTED,
    responses=error_responses(422, 429),
)
@limiter.limit(auth_rate_limit)
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: DbSession,
    background: BackgroundTasks,
    sender: EmailSenderDep,
) -> DataResponse[MessageOut]:
    found = auth_service.request_password_reset(db, body.email, ip=client_ip(request))
    if found is not None:
        user, token = found
        background.add_task(
            send_email_safely, sender, auth_service.password_reset_message(user, token)
        )
    # Same answer whether or not the account exists.
    return DataResponse(
        data=MessageOut(message="If an account exists for this email, we sent a reset link.")
    )


@router.post("/reset-password", responses=error_responses(400, 422, 429))
@limiter.limit(auth_rate_limit)
def reset_password(
    request: Request, body: ResetPasswordRequest, db: DbSession
) -> DataResponse[MessageOut]:
    auth_service.reset_password(db, body.token, body.new_password, ip=client_ip(request))
    return DataResponse(
        data=MessageOut(message="Your password was changed. Log in with your new password.")
    )


@router.get("/me", responses=error_responses(401))
def me(user: CurrentUser) -> DataResponse[UserOut]:
    return DataResponse(data=UserOut.from_user(user))
