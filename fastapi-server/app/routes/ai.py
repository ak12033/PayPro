from fastapi import APIRouter, Depends

from app.schemas.ai import (
    CategorizeRequest,
    CategorizeResponse,
    FraudCheckRequest,
    FraudCheckResponse,
)
from app.security import require_api_key
from app.services import scoring

# Server-to-server only. These two run inside the Node ledger's write path —
# a transaction cannot be created without them — so they stay a backend
# dependency guarded by the shared secret rather than a browser-facing route.
router = APIRouter(dependencies=[Depends(require_api_key)])


@router.post("/categorize", response_model=CategorizeResponse)
async def categorize_transaction(data: CategorizeRequest):
    return await scoring.categorize(data)


@router.post("/fraud-check", response_model=FraudCheckResponse)
async def check_fraud(data: FraudCheckRequest):
    return await scoring.check_fraud(data)
