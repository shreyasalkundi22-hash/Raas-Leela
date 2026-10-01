# RAAS LEELA 2026 - Garba & Dandiya Night Website

An opulent, high-energy, mobile-first event website created for **The Social House** presents **RAAS LEELA** (Garba & Dandiya Night) featuring celebrity headliner **DJ AURA**.

---

## Event Details
- **Organizer:** The Social House (in association with Adventure Arch)
- **Headliner:** DJ AURA
- **Date:** Tuesday, 13 October 2026
- **Time:** 6:00 PM Onwards
- **Venue:** Sports Space, Besides Sports Park, Near Oxford College, Kusugal Road, Hubli
- **Pass Categories:**
  - **Stag Pass:** Rs. 299
  - **Couple Pass:** Rs. 499 (Most Popular)
  - **Group of 5:** Rs. 1,199 (Save Rs. 300)
- **Lead Enquiries:**
  - Basu (Basavaraj): `+91 99168 79803`
  - Sumith: `+91 81239 13965`

---

## Portals & Security Credentials

### 1. Admin Portal (Command Center & Revenue Intelligence)
- **Access Route:** Click **Admin** in the header/drawer or navigate to `#admin`
- **Password:** `rl20206` *(Strictly CASE-SENSITIVE: `rl20206` is valid; uppercase or mixed case will be rejected)*
- **Security:** Authenticated via cryptographic SHA-256 hash match (`d3778c56ec11500849532666e99ef708ad3e2dfb4935366ffbf8844dd16a5260`) and protected session token. No plaintext password is stored in source code.
- **Features:** Real-time summary cards (Total Revenue, Paid Bookings, Total People, Checked In), live Pass Sales table breakdown, live Attendee Roster with CSV export, and instant session Logout.

### 2. Staff Gate Check-In & Camera QR Scanner Portal
- **Access Route:** Click **Staff** in the header/drawer or navigate to `#staff`
- **Password:** `RL20206` *(Gate Scanner personnel passcode)*
- **Security:** Authenticated via SHA-256 hash (`82e65644b822a641b7b020ca753915b461fa91439451880c9d363ab3a4b419a7`).
- **Features:** Live camera QR barcode scanner, manual ticket code lookup, real-time ticket admission, duplicate-entry prevention, and audit logs.

---

## Payment Verification Engine
- **Strict Policy:** NO VERIFIED PAYMENT = NO TICKET = NO ENTRY QR.
- **Provider:** Razorpay Payments Gateway & companion Node.js backend (`server.js`).
- **Configuration:** Set your public key in `gateway-config.js` (`window.RAZORPAY_KEY_ID`).
- **Server Verification:** Set `RAZORPAY_KEY_SECRET` in environment variables when running `server.js` to enable automatic HMAC-SHA256 signature verification and webhook processing.

---

## How to Run & Deploy

### Static Deployment (GitHub Pages / Vercel / Netlify)
1. Push repository to GitHub `main` branch.
2. Enable GitHub Pages in Repository Settings -> Pages -> Source: Deploy from branch `main` / `root`.

### Companion Backend Server (Node.js)
```bash
node server.js
```
The server will start on `http://localhost:3000` with zero external dependencies required.
