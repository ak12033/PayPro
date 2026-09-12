class ApiError(Exception):
    """
    An expected, client-facing failure.

    The body is shaped `{message, code}` to match the Node backend's error
    envelope: the SPA's axios interceptor reads `data.code` to decide whether a
    401 is worth a silent token refresh, and `data.message` is what every screen
    renders. Returning FastAPI's default `{detail}` here would make the browser
    log the user out on an expired token instead of refreshing it.
    """

    def __init__(self, status_code: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code

    def body(self) -> dict:
        payload = {"message": self.message}
        if self.code:
            payload["code"] = self.code
        return payload


class AuthError(ApiError):
    def __init__(self, message: str, code: str):
        super().__init__(401, message, code)
