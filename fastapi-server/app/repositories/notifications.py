from bson import ObjectId

from app import database


def _collection():
    return database.get_database()["notifications"]


async def recent(user_id: ObjectId, limit: int = 5) -> list[dict]:
    cursor = (
        _collection()
        .find(
            {"userId": user_id},
            {"_id": 0, "title": 1, "message": 1, "type": 1, "createdAt": 1, "isRead": 1},
        )
        .sort("createdAt", -1)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)
