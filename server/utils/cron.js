import cron from 'node-cron';
import User from '../models/User.js';
import { notifyUser } from '../services/notificationService.js';

export const startCronJobs = () => {
    // Run every day at 09:00 AM
    cron.schedule('0 9 * * *', async () => {
        console.log('Running scheduled bill reminder check...');
        try {
            // In a real application, you would query a "Bills" or "Subscriptions" collection
            // For demonstration, we'll send a reminder to all users who have low balances
            
            const usersWithLowBalance = await User.find({ accountBalance: { $lt: 500 } });
            
            for (const user of usersWithLowBalance) {
                await notifyUser(
                    user._id,
                    'Reminder',
                    'Low Balance Warning',
                    `Your account balance is ₹${user.accountBalance}. Consider topping up your wallet to avoid failed transactions.`,
                    { balance: user.accountBalance }
                );
            }

            console.log(`Sent low balance reminders to ${usersWithLowBalance.length} users.`);
        } catch (error) {
            console.error('Error in scheduled reminder job:', error);
        }
    });
    
    console.log('Cron jobs initialized successfully.');
};
