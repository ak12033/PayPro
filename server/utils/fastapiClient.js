import axios from 'axios';
import config from '../config/env.js';

const fastapiClient = axios.create({
    baseURL: config.FASTAPI_URL || 'http://localhost:8000',
    timeout: 10000, // 10 seconds timeout
});

export const categorizeTransaction = async (description, amount) => {
    try {
        const response = await fastapiClient.post('/ai/categorize', { description, amount });
        return response.data;
    } catch (error) {
        console.error('FastAPI Categorization Error:', error.message);
        return { category: 'Others', confidence_score: 0.0, icon: 'CircleDollarSign' };
    }
};

export const checkFraud = async (newTransaction, history) => {
    try {
        const response = await fastapiClient.post('/ai/fraud-check', {
            new_transaction: newTransaction,
            history: history
        });
        return response.data;
    } catch (error) {
        console.error('FastAPI Fraud Check Error:', error.message);
        return { risk_score: 0, risk_level: 'low', reason: 'Fraud check service unavailable.' };
    }
};

export const getInsights = async (transactions) => {
    try {
        const response = await fastapiClient.post('/ai/insights', { transactions });
        return response.data.insights;
    } catch (error) {
        console.error('FastAPI Insights Error:', error.message);
        return [];
    }
};

export const getAssistantResponse = async (query, transactions) => {
    try {
        const response = await fastapiClient.post('/ai/assistant', { query, transactions });
        return response.data.response;
    } catch (error) {
        console.error('FastAPI Assistant Error:', error.message);
        return 'I am currently unable to process your request due to a service connection error.';
    }
};

export default fastapiClient;
