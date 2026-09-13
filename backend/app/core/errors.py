import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from ..schemas.contracts import ErrorBody, ErrorDetail, ErrorResponse

logger = logging.getLogger("landsight.backend")


class APIError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


def error_response(status: int, code: str, message: str, details: list[ErrorDetail] | None = None) -> JSONResponse:
    payload = ErrorResponse(error=ErrorBody(code=code, message=message, details=details or []))
    return JSONResponse(status_code=status, content=payload.model_dump(by_alias=True))


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def domain_error(_request: Request, exc: APIError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            ErrorDetail(location=list(error["loc"]), message=error["msg"], type=error["type"])
            for error in exc.errors()
        ]
        return error_response(422, "VALIDATION_ERROR", "Request validation failed.", details)

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        codes = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
        response = error_response(exc.status_code, codes.get(exc.status_code, "HTTP_ERROR"), str(exc.detail))
        if exc.headers:
            response.headers.update(exc.headers)
        return response

    @app.exception_handler(Exception)
    async def unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled backend exception", exc_info=(type(exc), exc, exc.__traceback__))
        return error_response(500, "INTERNAL_ERROR", "An unexpected server error occurred.")
