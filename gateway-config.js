/**
 * Raas Leela 2026 - Payment Gateway & Netlify API Configuration
 *
 * SECURITY NOTICE:
 * - Never place RAZORPAY_KEY_SECRET in frontend files or client-side JavaScript.
 * - In Netlify deployment, credentials (RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET) are
 *   configured securely in Netlify Environment Variables:
 *   Site configuration > Environment variables
 * - Netlify Functions (/netlify/functions/create-order & /netlify/functions/verify-payment)
 *   automatically access these environment variables on the server side.
 * - Client-side checkout receives the public Key ID securely from the create-order response.
 *
 * OPTIONAL CONFIGURATION:
 * - window.RAAS_BACKEND_API_URL: Leave empty when deployed on Netlify (uses relative routes).
 *   Set this ONLY if accessing the Netlify backend from an external domain (e.g. 'https://your-site.netlify.app').
 */
window.RAZORPAY_KEY_ID = window.RAZORPAY_KEY_ID || "";
window.RAAS_BACKEND_API_URL = window.RAAS_BACKEND_API_URL || "";
