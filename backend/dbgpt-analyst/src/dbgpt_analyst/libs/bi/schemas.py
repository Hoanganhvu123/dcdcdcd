from typing import Any
from pydantic import BaseModel


class RelationshipCreate(BaseModel):
    from_source_id: str | None = "0"
    from_table: str
    from_column: str
    to_source_id: str | None = "0"
    to_table: str
    to_column: str
    join_type: str | None = "LEFT"
    ai_suggested: bool | None = False
    confirmed: bool | None = True
    confidence: float | None = 1.0


class RelationshipUpdate(BaseModel):
    confirmed: bool | None = None
    join_type: str | None = None
