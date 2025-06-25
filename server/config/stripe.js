import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // add your secret key in .env
export default stripe;
