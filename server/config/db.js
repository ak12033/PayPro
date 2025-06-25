import mongoose from "mongoose";

// Function to connect to the MongoDB database
const connectDB = async () => {
    try {
        mongoose.connection.on('connected', () => console.log("Database Connected"));
        await mongoose.connect(`${process.env.MONGO_URI}/PayPro`);
    } catch (error) {
        console.log(error.message);   
    }
};

export default connectDB;