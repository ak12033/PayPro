from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Literal

# (The unused `PromptRequest` model was removed — nothing imported or served it.)


# Categorization
class CategorizeRequest(BaseModel):
    # Bounded so a caller cannot push an arbitrarily large prompt — billed per
    # token — through this endpoint.
    description: str = Field(min_length=1, max_length=500)
    amount: float = Field(ge=0)


class CategorizeResponse(BaseModel):
    category: str = Field(description="The financial category (e.g., Food, Travel, Rent, Bills, Shopping, Groceries, Internet, Healthcare, P2P, Loan, Investment, Savings, Gift, Donation, Education, Insurance, Subscription, Entertainment, Others)")
    confidence_score: float = Field(description="Confidence score between 0.0 and 1.0")
    icon: str = Field(description="A suitable Lucide icon name (e.g., ShoppingBag, Plane, Home, Zap, HeartPulse)")


# Fraud Check
class TransactionData(BaseModel):
    description: str = Field(max_length=500)
    amount: float
    type: str = Field(max_length=20)
    category: Optional[str] = Field(default=None, max_length=60)


class FraudCheckRequest(BaseModel):
    new_transaction: TransactionData
    # Capped: the Node client sends 10, but nothing stopped a much larger list
    # from inflating the prompt.
    history: List[TransactionData] = Field(default_factory=list, max_length=50)


class FraudCheckResponse(BaseModel):
    risk_score: int = Field(ge=0, le=100, description="Risk score from 0 (lowest) to 100 (highest)")
    # Literal, not a bare str: the Node side writes this straight into a
    # Mongoose enum, so an off-list value from the model ('critical', 'Low')
    # raised a validation error that failed the user's whole transaction.
    risk_level: Literal["low", "medium", "high"] = Field(description="Risk level")
    reason: str = Field(max_length=500, description="Human-readable reason for the assigned risk level")

    @field_validator("risk_level", mode="before")
    @classmethod
    def normalise_level(cls, value):
        if isinstance(value, str):
            return value.strip().lower()
        return value


# AI Assistant
class AssistantRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    transactions: List[dict] = Field(default_factory=list, max_length=100, description="Recent user transactions context")


class AssistantResponse(BaseModel):
    response: str = Field(description="The assistant's conversational response")


# AI Insights
class InsightsRequest(BaseModel):
    transactions: List[dict] = Field(default_factory=list, max_length=200, description="User transactions to analyze")


class InsightItem(BaseModel):
    title: str = Field(description="A short title for the insight")
    description: str = Field(description="Detailed explanation or recommendation")
    type: str = Field(description="Type of insight: 'trend', 'budget', 'warning', or 'summary'")


class InsightsResponse(BaseModel):
    insights: List[InsightItem] = Field(description="List of structured insights")
