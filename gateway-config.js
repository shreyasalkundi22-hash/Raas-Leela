/**
 * Raas Leela 2026 - Payment Gateway & API Configuration
 *
 * NOTE: For maximum security, secret keys (RAZORPAY_KEY_SECRET, WEBHOOK_SECRET)
 * must NEVER be placed in client-side files or public repositories.
 * Secret keys belong strictly in backend environment variables or server.js.
 *
 * To enable live/test Razorpay payments:
 * - Enter your public Razorpay Key ID below (e.g. 'rzp_test_XXXXXXXXXXXXXX' or 'rzp_live_XXXXXXXXXXXXXX')
 * - If using the companion server.js backend, set RAAS_BACKEND_API_URL (e.g. 'http://localhost:3000' or your production backend URL)
 */
window.RAZORPAY_KEY_ID = window.RAZORPAY_KEY_ID || "";
window.RAAS_BACKEND_API_URL = window.RAAS_BACKEND_API_URL || "";
