import Stripe from 'stripe';
import config from './env.js';

const stripe = new Stripe(config.STRIPE_SECRET_KEY); // add your secret key in .env
export default stripe;
