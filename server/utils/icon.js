import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// AI-based icon suggester using Gemini API
const categorizeIconWithLLM = async (description) => {
    try {
        const prompt = `You are a financial transaction icon suggester.
            For this transaction description: "${description}", suggest a suitable Lucide icon name 
            (e.g., ShoppingBag, Plane, CreditCard, DollarSign, Pizza, Hospital, Gift, etc.)
            that visually represents the transaction category.
            Only reply with the icon name as plain text. No extra words.`;

        const result = await model.generateContent(prompt);
        const icon = result.response.text().trim();

        return icon || "CircleDollarSign";

    } catch (error) {
        if (error.message.includes("429")) {
            return "CircleDollarSign";
        }
        console.error("Gemini icon suggestion error:", error);
        throw new Error("Failed to suggest icon with Gemini.");
    }
};

export default categorizeIconWithLLM;


