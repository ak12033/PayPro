from bson import ObjectId

from app import database


def _collection():
    return database.get_database()["users"]


async def find_token_version(user_id: ObjectId) -> dict | None:
    return await _collection().find_one({"_id": user_id}, {"tokenVersion": 1})


async def find_balance(user_id: ObjectId) -> float:
    """
    The balance in rupees, derived from `balanceMinor` (integer paise).

    `balanceMinor` is the ledger's source of truth since plan.md §7.4 step 3;
    the rupee `accountBalance` double is only still written as a rollback
    path. It is used here only for a document that has no `balanceMinor` at
    all, which the Node server's paise backfill eliminates.
    """
    user = await _collection().find_one({"_id": user_id}, {"balanceMinor": 1, "accountBalance": 1})
    if not user:
        return 0.0
    minor = user.get("balanceMinor")
    if isinstance(minor, int):
        return minor / 100
    return round(float(user.get("accountBalance", 0)), 2)


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
