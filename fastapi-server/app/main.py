from fastapi import FastAPI
from app.routes import ai
from app import config

app = FastAPI()

@app.get("/")
def home():
    return {"message": "FastAPI + Gemini (new SDK) 🚀"}

app.include_router(ai.router, prefix="/ai")