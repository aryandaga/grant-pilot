from pydantic import BaseModel, EmailStr
from uuid import UUID
from app.models.user import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: UserRole = UserRole.member


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: UserRole

    model_config = {"from_attributes": True}
