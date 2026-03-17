from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.security import decode_token

_bearer = HTTPBearer()

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired token.",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    """Validate the Bearer JWT and return the user_id (sub claim).

    Usage in route handlers:
        user_id: str = Depends(get_current_user)

    Hard Rule 2: never accept user_id from the request body — always use this dep.
    """
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise _UNAUTHORIZED

    user_id: str | None = payload.get("sub")
    token_type: str | None = payload.get("type")

    if not user_id or token_type != "access":
        raise _UNAUTHORIZED

    return user_id


async def get_admin_user(
    user_id: str = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    """Validate the Bearer JWT and assert the user holds the 'admin' role.

    Roles are embedded in the JWT 'roles' claim when the token is issued.
    """
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise _UNAUTHORIZED

    roles: list[str] = payload.get("roles", [])
    if "admin" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access only.",
        )

    return user_id
