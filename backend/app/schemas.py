from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["viewer", "editor"]


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=6, max_length=200)

    @field_validator("email")
    @classmethod
    def email_shape(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or v.startswith("@") or v.endswith("@"):
            raise ValueError("Enter a valid email")
        return v

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name can't be blank")
        return v


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


class DocCreate(BaseModel):
    title: str = Field(default="Untitled document", max_length=200)
    content: str = ""


class DocUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None
    # The version the client last saw. Required so stale saves get rejected.
    base_version: int

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Title can't be blank")
        return v


class DocSummary(BaseModel):
    id: int
    title: str
    owner: UserOut
    role: Literal["owner", "viewer", "editor"]
    updated_at: datetime
    updated_by: UserOut | None
    shared_with_count: int


class DocOut(DocSummary):
    content: str
    version: int


class DocList(BaseModel):
    owned: list[DocSummary]
    shared: list[DocSummary]


class ShareIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    role: Role = "editor"


class ShareOut(BaseModel):
    user: UserOut
    role: Role


class ConvertOut(BaseModel):
    html: str
    title: str
