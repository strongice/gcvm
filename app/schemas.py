from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class VariableSummary(BaseModel):
    key: str
    variable_type: str = Field(description="Must be 'file'")
    environment_scope: str = "*"
    protected: bool = False
    masked: bool = False
    raw: bool = False


class VariableDetail(VariableSummary):
    value: str = ""


class UpsertVariableRequest(BaseModel):
    key: str
    value: str
    environment_scope: str = "*"
    protected: bool = False
    masked: bool = False
    raw: bool = False

    # Для корректного «переименования» ключа/окружения:
    original_key: Optional[str] = None
    original_environment_scope: Optional[str] = None

