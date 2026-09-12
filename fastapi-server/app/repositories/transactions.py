from bson import ObjectId

from app import database

# Matches the projection every Node AI path used, so prompts see exactly the
# fields they saw before.
CONTEXT_FIELDS = {
    "_id": 0,
    "description": 1,
    "amount": 1,
    "type": 1,
    "category": 1,
    "createdAt": 1,
}

ASSISTANT_FIELDS = {
    "_id": 0,
    "description": 1,
    "amount": 1,
    "type": 1,
    "category": 1,
    "createdAt": 1,
    "invoiceId": 1,
    "riskScore": 1,
    "riskLevel": 1,
}

# Credits in these categories are money the user added, not money received.
TOP_UP_CATEGORIES = ["Top Up", "Stripe"]


def _collection():
    return database.get_database()["transactions"]


async def recent_for_context(user_id: ObjectId, limit: int) -> list[dict]:
    """Newest-first slice used as prompt context. Served by {userId, createdAt}."""
    cursor = (
        _collection()
        .find({"userId": user_id}, CONTEXT_FIELDS)
        .sort("createdAt", -1)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def find_for_assistant(
    user_id: ObjectId,
    limit: int,
    tx_type: str | None = None,
    category: str | None = None,
) -> list[dict]:
    # The userId filter IS the authorization check, and it is applied here
    # rather than taken from anything the model produced.
    query: dict = {"userId": user_id}
    if tx_type:
        query["type"] = tx_type
    if category:
        query["category"] = category

    cursor = _collection().find(query, ASSISTANT_FIELDS).sort("createdAt", -1).limit(limit)
    return await cursor.to_list(length=limit)


async def spending_totals(user_id: ObjectId) -> dict:
    """
    Lifetime sent / received / added.

    Aggregated in the database. The Node implementation this replaces loaded
    every transaction the user had ever made into memory and summed them in JS
    (context.md §7, S2) — which on a busy account is an unbounded fetch on a
    request the user is waiting on.
    """
    pipeline = [
        {"$match": {"userId": user_id}},
        {
            "$group": {
                "_id": None,
                "totalSent": {
                    "$sum": {
                        "$cond": [{"$eq": ["$type", "Debit"]}, {"$abs": "$amount"}, 0]
                    }
                },
                "totalAdded": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$eq": ["$type", "Credit"]},
                                    {"$in": ["$category", TOP_UP_CATEGORIES]},
                                ]
                            },
                            {"$abs": "$amount"},
                            0,
                        ]
                    }
                },
                "totalReceived": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$eq": ["$type", "Credit"]},
                                    {"$not": [{"$in": ["$category", TOP_UP_CATEGORIES]}]},
                                ]
                            },
                            {"$abs": "$amount"},
                            0,
                        ]
                    }
                },
                "totalTransactions": {"$sum": 1},
            }
        },
        {"$project": {"_id": 0}},
    ]

    # `aggregate` is itself awaitable here, unlike `find` which returns a
    # cursor directly.
    cursor = await _collection().aggregate(pipeline)
    rows = await cursor.to_list(length=1)
    if not rows:
        return {"totalSent": 0, "totalReceived": 0, "totalAdded": 0, "totalTransactions": 0}
    return rows[0]
