from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    # Bounded: an unbounded query is billed to us per token and can be used to
    # push the system prompt out of the context window.
    query: str = Field(min_length=1, max_length=2000)
    # The SPA's current route, used only as page-awareness context.
    path: str | None = Field(default=None, max_length=200)


class ChatResponse(BaseModel):
    response: str


class ChatMessage(BaseModel):
    sender: Literal["user", "ai"]
    text: str
    createdAt: datetime | None = None


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)


class ClearHistoryResponse(BaseModel):
    message: str
    messages: list[ChatMessage] = Field(default_factory=list)
