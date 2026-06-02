from fastapi import APIRouter, HTTPException
from pydantic import ValidationError
from google.genai import types

from app.schemas.ai import (
    PromptRequest, 
    CategorizeRequest, CategorizeResponse,
    FraudCheckRequest, FraudCheckResponse,
    AssistantRequest, AssistantResponse,
    InsightsRequest, InsightsResponse
)
from app.config import client

router = APIRouter()

@router.post("/categorize", response_model=CategorizeResponse)
async def categorize_transaction(data: CategorizeRequest):
    prompt = f"""
    Analyze the following transaction:
    Description: {data.description}
    Amount: {data.amount}

    Provide the best matching category from this list: Food, Travel, Rent, Bills, Shopping, Groceries, Internet, Healthcare, P2P, Loan, Investment, Savings, Gift, Donation, Education, Insurance, Subscription, Entertainment, Others.
    Also provide a suitable Lucide icon name (e.g. Utensils, Plane, Home, Receipt, ShoppingBag, ShoppingCart, Wifi, HeartPulse, User, PiggyBank, Briefcase, GraduationCap, Shield, Tv, CircleDollarSign).
    Provide a confidence score.
    """
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=CategorizeResponse,
                temperature=0.1
            ),
        )
        # response.parsed contains the Pydantic object
        return response.parsed
    except Exception as e:
        print(f"Categorization Error: {e}")
        # Fallback
        return CategorizeResponse(category="Others", confidence_score=0.0, icon="CircleDollarSign")


@router.post("/fraud-check", response_model=FraudCheckResponse)
async def check_fraud(data: FraudCheckRequest):
    history_text = "\n".join([
        f"- {tx.type} | {tx.category or 'Unknown'} | {tx.description} | {tx.amount}"
        for tx in data.history
    ])

    new_tx = data.new_transaction
    
    prompt = f"""
    You are an AI Fraud Detection Engine.
    Analyze this new transaction:
    Description: {new_tx.description}
    Amount: {new_tx.amount}
    Type: {new_tx.type}
    Category: {new_tx.category or 'Unknown'}

    User's recent transaction history context:
    {history_text if history_text else "No history available."}

    Evaluate the new transaction for fraud risk based on unusual amounts compared to history, anomalies, or suspicious patterns.
    Assign a risk score (0-100), a risk level (low, medium, high), and provide a brief human-readable reason.
    """
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=FraudCheckResponse,
                temperature=0.2
            ),
        )
        return response.parsed
    except Exception as e:
        print(f"Fraud Check Error: {e}")
        # Fallback
        return FraudCheckResponse(risk_score=0, risk_level="low", reason="AI check failed. Defaulting to low risk.")


@router.post("/assistant", response_model=AssistantResponse)
async def ai_assistant(data: AssistantRequest):
    transactions_text = "\n".join([
        f"- {tx.get('createdAt', '')[:10]} | {tx.get('type', '')} | {tx.get('category', '')} | {tx.get('description', '')} | {tx.get('amount', 0)}"
        for tx in data.transactions
    ])

    prompt = f"""
    You are a helpful, conversational Financial Assistant.
    Answer the user's query clearly and concisely based on their recent transactions.

    Recent Transactions Context:
    {transactions_text if transactions_text else "No transactions available."}

    User Query: {data.query}
    """
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AssistantResponse,
                temperature=0.7
            ),
        )
        return response.parsed
    except Exception as e:
        print(f"Assistant Error: {e}")
        return AssistantResponse(response="I'm sorry, I'm having trouble analyzing your request right now.")


@router.post("/insights", response_model=InsightsResponse)
async def ai_insights(data: InsightsRequest):
    transactions_text = "\n".join([
        f"- {tx.get('createdAt', '')[:10]} | {tx.get('type', '')} | {tx.get('category', '')} | {tx.get('description', '')} | {tx.get('amount', 0)}"
        for tx in data.transactions
    ])

    prompt = f"""
    You are an AI Financial Insights Engine.
    Analyze the user's recent transactions and provide 3-5 structured insights.
    Focus on spending trends, budget recommendations, expense summaries, or unusual spending warnings.

    Recent Transactions:
    {transactions_text if transactions_text else "No transactions available."}
    """
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=InsightsResponse,
                temperature=0.4
            ),
        )
        return response.parsed
    except Exception as e:
        print(f"Insights Error: {e}")
        return InsightsResponse(insights=[])