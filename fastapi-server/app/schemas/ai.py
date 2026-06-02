from pydantic import BaseModel, Field
from typing import List, Optional

class PromptRequest(BaseModel):
    prompt: str

# Categorization
class CategorizeRequest(BaseModel):
    description: str
    amount: float

class CategorizeResponse(BaseModel):
    category: str = Field(description="The financial category (e.g., Food, Travel, Rent, Bills, Shopping, Groceries, Internet, Healthcare, P2P, Loan, Investment, Savings, Gift, Donation, Education, Insurance, Subscription, Entertainment, Others)")
    confidence_score: float = Field(description="Confidence score between 0.0 and 1.0")
    icon: str = Field(description="A suitable Lucide icon name (e.g., ShoppingBag, Plane, Home, Zap, HeartPulse)")

# Fraud Check
class TransactionData(BaseModel):
    description: str
    amount: float
    type: str
    category: Optional[str] = None

class FraudCheckRequest(BaseModel):
    new_transaction: TransactionData
    history: List[TransactionData] = Field(default_factory=list)

class FraudCheckResponse(BaseModel):
    risk_score: int = Field(description="Risk score from 0 (lowest) to 100 (highest)")
    risk_level: str = Field(description="Risk level: 'low', 'medium', or 'high'")
    reason: str = Field(description="Human-readable reason for the assigned risk level")

# AI Assistant
class AssistantRequest(BaseModel):
    query: str
    transactions: List[dict] = Field(default_factory=list, description="Recent user transactions context")

class AssistantResponse(BaseModel):
    response: str = Field(description="The assistant's conversational response")

# AI Insights
class InsightsRequest(BaseModel):
    transactions: List[dict] = Field(default_factory=list, description="User transactions to analyze")

class InsightItem(BaseModel):
    title: str = Field(description="A short title for the insight")
    description: str = Field(description="Detailed explanation or recommendation")
    type: str = Field(description="Type of insight: 'trend', 'budget', 'warning', or 'summary'")

class InsightsResponse(BaseModel):
    insights: List[InsightItem] = Field(description="List of structured insights")