import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// AI-based transaction categorizer using Gemini API
const categorizeTransactionWithLLM = async (description) => {
    try {
        const prompt = `
        You are a financial transaction categorizer.
        Categorize this transaction description: "${description}".
        Available categories: Food, Travel, Rent, Bills, Shopping, Groceries, Internet, Healthcare, 
        P2P, Loan, Investment, Savings, Gift, Donation, Education, Insurance, Subscription, 
        Entertainment, Others.
        Only reply with the category name.`;
        const result = await model.generateContent(prompt);
        const category = result.response.text().trim();

        return category;

    } catch (error) {
        // Specific rate-limit handling
        if (error.message.includes("429")) {
            return "Rate limit exceeded. Please try again after a while.";
        }

        console.error("Gemini categorization error:", error);
        throw new Error("Failed to categorize transaction with Gemini.");
    }
};

export default categorizeTransactionWithLLM;


