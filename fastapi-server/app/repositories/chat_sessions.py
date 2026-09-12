from datetime import UTC, datetime

from bson import ObjectId

from app import database

# Mongoose pluralises the ChatSession model to this collection.
COLLECTION = "chatsessions"

# Hard cap on retained turns, unchanged from the Node model it replaces: the
# array was once unbounded and grew until the document hit MongoDB's 16MB limit,
# after which every save failed permanently.
MAX_CHAT_MESSAGES = 40


def _collection():
    return database.get_database()[COLLECTION]


async def find_messages(user_id: ObjectId) -> list[dict]:
    session = await _collection().find_one({"userId": user_id}, {"_id": 0, "messages": 1})
    return list(session.get("messages", [])) if session else []


async def append_turn(user_id: ObjectId, user_text: str, ai_text: str) -> None:
    """
    Append both halves of a turn and trim, in one operation.

    A read-modify-write on the loaded document dropped messages sent
    concurrently from another tab; `$push` with `$slice` appends and caps
    atomically. The document shape is the one the Mongoose schema wrote, so
    existing histories keep working untouched.
    """
    now = datetime.now(UTC)
    await _collection().update_one(
        {"userId": user_id},
        {
            "$push": {
                "messages": {
                    "$each": [
                        {"sender": "user", "text": user_text, "createdAt": now},
                        {"sender": "ai", "text": ai_text, "createdAt": now},
                    ],
                    "$slice": -MAX_CHAT_MESSAGES,
                }
            },
            "$set": {"updatedAt": now},
            "$setOnInsert": {"userId": user_id, "createdAt": now, "__v": 0},
        },
        upsert=True,
    )


async def clear(user_id: ObjectId) -> None:
    await _collection().delete_one({"userId": user_id})
