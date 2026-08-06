import re

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


def validate_password_strength(password: str) -> str:
    if len(password) < 8:
        raise ValueError("비밀번호는 8자 이상이어야 합니다.")
    if not re.search(r"[A-Za-z]", password):
        raise ValueError("비밀번호에 영문자를 포함해야 합니다.")
    if not re.search(r"\d", password):
        raise ValueError("비밀번호에 숫자를 포함해야 합니다.")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValueError("비밀번호에 특수문자를 포함해야 합니다.")
    return password


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_password_strength(value)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str


class Token(BaseModel):
    access_token: str
    token_type: str


class EmailRequest(BaseModel):
    email: EmailStr


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    code: str
