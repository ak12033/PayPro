from bson import ObjectId

from app import database


def _collection():
    return database.get_database()["users"]


async def find_token_version(user_id: ObjectId) -> dict | None:
    return await _collection().find_one({"_id": user_id}, {"tokenVersion": 1})


async def find_balance(user_id: ObjectId) -> float:
    user = await _collection().find_one({"_id": user_id}, {"accountBalance": 1})
    return float(user.get("accountBalance", 0)) if user else 0.0


async def find_profile(user_id: ObjectId) -> dict | None:
    return await _collection().find_one(
        {"_id": user_id},
        {
            "firstName": 1,
            "lastName": 1,
            "email": 1,
            "lastLoginLocation": 1,
            "preferences": 1,
        },
    )
