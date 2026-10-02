/**
 * Raas Leela 2026 - Payment & System Configuration
 *
 * PAYMENT METHOD:
 * - Personal UPI QR & Manual Organizer Payment Approval.
 * - Central database powered by Supabase PostgreSQL.
 * - Netlify Functions handle server-side ticket minting, admin approval, and gate check-in.
 *
 * PERSONAL UPI QR:
 * - Place your personal UPI QR image file at: upi-qr.png in the project root.
 */
window.RAAS_UPI_QR_IMAGE = window.RAAS_UPI_QR_IMAGE || "upi-qr.png";
window.RAAS_BACKEND_API_URL = window.RAAS_BACKEND_API_URL || "";
