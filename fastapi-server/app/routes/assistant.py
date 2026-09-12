import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, require_user, require_user_within_rate_limit
from app.errors import ApiError
from app.repositories import chat_sessions as chat_repo
from app.schemas.ai import InsightsResponse
from app.schemas.assistant import (
    ChatHistoryResponse,
    ChatRequest,
    ChatResponse,
    ClearHistoryResponse,
)
from app.services import assistant, insights

logger = logging.getLogger("paypro-ai")

Authed = Annotated[CurrentUser, Depends(require_user)]
MeteredAuthed = Annotated[CurrentUser, Depends(require_user_within_rate_limit)]

# Browser-facing. Every route authenticates the SPA's own access token; the
# request no longer passes through the Node backend.
router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(data: ChatRequest, user: MeteredAuthed):
    try:
        reply = await assistant.chat(user.oid, data.query, data.path)
    except TimeoutError:
        logger.warning("Assistant timed out for user %s", user.id)
        raise ApiError(
            503, "The assistant is taking too long to respond. Please try again."
        ) from None
    except Exception:
        logger.exception("Assistant failed for user %s", user.id)
        raise ApiError(
            503, "The assistant is taking too long to respond. Please try again."
        ) from None

    return ChatResponse(response=reply)


@router.get("/history", response_model=ChatHistoryResponse)
async def chat_history(user: Authed):
    return ChatHistoryResponse(messages=await chat_repo.find_messages(user.oid))


@router.delete("/history", response_model=ClearHistoryResponse)
async def clear_chat_history(user: Authed):
    await chat_repo.clear(user.oid)
    return ClearHistoryResponse(message="Chat history cleared successfully", messages=[])


@router.get("/insights", response_model=InsightsResponse)
async def ai_insights(user: MeteredAuthed):
    return await insights.generate_for_user(user.oid)
