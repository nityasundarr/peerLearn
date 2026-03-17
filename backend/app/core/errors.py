from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


# ---------------------------------------------------------------------------
# Domain exception hierarchy
# ---------------------------------------------------------------------------

class AppError(Exception):
    """Base class for all application-level errors."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class NotFoundError(AppError):
    def __init__(self, detail: str = "Resource not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class ConflictError(AppError):
    def __init__(self, detail: str = "A conflict occurred.") -> None:
        super().__init__(status.HTTP_409_CONFLICT, detail)


class ForbiddenError(AppError):
    def __init__(self, detail: str = "Access denied.") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, detail)


class UnprocessableError(AppError):
    def __init__(self, detail: str = "Unprocessable request.") -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, detail)


class RateLimitError(AppError):
    def __init__(self, detail: str = "Too many requests. Please try again later.") -> None:
        super().__init__(status.HTTP_429_TOO_MANY_REQUESTS, detail)


# ---------------------------------------------------------------------------
# Handler registration
# ---------------------------------------------------------------------------

def register_exception_handlers(app: FastAPI) -> None:
    """Attach all exception handlers to the FastAPI app.

    Hard Rule 6: never expose raw DB or internal errors to clients.
    Every handler returns a clean {"detail": "..."} body.
    """

    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Surface field-level Pydantic errors without leaking internals.
        errors = [
            {"field": ".".join(str(p) for p in e["loc"]), "msg": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": "Validation failed.", "errors": errors},
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"detail": "An unexpected error occurred. Please try again later."},
        )
