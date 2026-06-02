import mongoose from "mongoose";
import config from "./env.js";

// Function to connect to the MongoDB database
const connectDB = async () => {
    try {
        mongoose.connection.on('connected', () => console.log("Database Connected"));
        await mongoose.connect(`${config.MONGO_URI}/PayPro`);
    } catch (error) {
        console.log(error.message);   
    }
};

export default connectDB;