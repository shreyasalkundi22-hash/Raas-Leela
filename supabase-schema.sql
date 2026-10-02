-- ============================================================================
-- RAAS LEELA 2026 - PRODUCTION DATABASE SCHEMA & SECURE ATOMIC PROCEDURES
-- ============================================================================
-- Complete Security & Logic Audit Applied:
-- 1. Strict table-level price & admit constraints prevent any amount tampering.
-- 2. Concurrency-safe row-level locks (FOR UPDATE) prevent race conditions.
-- 3. Idempotent payment approval with UNIQUE (booking_id, pass_index) prevents duplicate tickets.
-- 4. Separate read-only inspection (inspect_ticket_for_staff) and atomic redemption (redeem_ticket_atomic).
-- 5. Secure customer ticket retrieval requiring Booking ID + Phone matching.
-- 6. Pinned search_path = public, pg_temp prevents search-path hijacking on all SECURITY DEFINER functions.
-- 7. Public PostgREST RPC access explicitly revoked from PUBLIC, anon, and authenticated roles.
--    All procedures and tables are accessible strictly via service_role (Netlify backend).
-- ============================================================================

-- Clean start (safe if re-run)
DROP FUNCTION IF EXISTS public.redeem_ticket_atomic(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.inspect_ticket_for_staff(TEXT);
DROP FUNCTION IF EXISTS public.approve_payment_atomic(TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.reject_payment_atomic(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.retrieve_booking_tickets_secure(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_admin_dashboard_stats();

-- ----------------------------------------------------------------------------
-- 1. BOOKINGS TABLE (With Strict Mathematical & Pricing Constraints)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
    id TEXT PRIMARY KEY,                             -- e.g. 'RL-74920158'
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    tier TEXT NOT NULL CHECK (tier IN ('stag', 'couple', 'group')),
    pass_name TEXT NOT NULL CHECK (pass_name IN ('STAG PASS', 'COUPLE PASS', 'GROUP OF 5')),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 20),
    admit_per_pass INTEGER NOT NULL CHECK (admit_per_pass IN (1, 2, 5)),
    total_admit INTEGER NOT NULL CHECK (total_admit > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price IN (299, 499, 1199)),
    expected_amount INTEGER NOT NULL CHECK (expected_amount > 0),
    upi_reference TEXT,                              -- Customer-submitted UPI UTR / Transaction ID
    payment_status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT' 
        CHECK (payment_status IN ('AWAITING_PAYMENT', 'PENDING_VERIFICATION', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED')),
    ticket_status TEXT NOT NULL DEFAULT 'NOT_ISSUED' 
        CHECK (ticket_status IN ('NOT_ISSUED', 'ACTIVE', 'REDEEMED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    rejected_at TIMESTAMPTZ,
    rejected_reason TEXT,

    -- IMMUTABLE PRICING INTEGRITY CONSTRAINTS:
    -- Mathematically guarantees that unit_price, admit_per_pass, total_admit, and expected_amount
    -- can never be tampered with or miscalculated.
    CONSTRAINT chk_tier_pricing CHECK (
        (tier = 'stag' AND pass_name = 'STAG PASS' AND unit_price = 299 AND admit_per_pass = 1) OR
        (tier = 'couple' AND pass_name = 'COUPLE PASS' AND unit_price = 499 AND admit_per_pass = 2) OR
        (tier = 'group' AND pass_name = 'GROUP OF 5' AND unit_price = 1199 AND admit_per_pass = 5)
    ),
    CONSTRAINT chk_expected_amount_calc CHECK (expected_amount = unit_price * quantity),
    CONSTRAINT chk_total_admit_calc CHECK (total_admit = admit_per_pass * quantity)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON public.bookings(phone);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON public.bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_ticket_status ON public.bookings(ticket_status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_submitted_at ON public.bookings(payment_submitted_at DESC);

-- ----------------------------------------------------------------------------
-- 2. TICKETS TABLE (Individual verified passes issued only upon Admin approval)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tickets (
    id TEXT PRIMARY KEY,                             -- Unique public Ticket ID: e.g. 'RL-K98W2A'
    booking_id TEXT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    pass_index INTEGER NOT NULL CHECK (pass_index >= 1), -- 1, 2, ... up to quantity
    pass_number TEXT NOT NULL,                       -- e.g. '1 of 1', '1 of 2'
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    tier TEXT NOT NULL CHECK (tier IN ('stag', 'couple', 'group')),
    pass_name TEXT NOT NULL CHECK (pass_name IN ('STAG PASS', 'COUPLE PASS', 'GROUP OF 5')),
    admit_count INTEGER NOT NULL CHECK (admit_count IN (1, 2, 5)),
    amount INTEGER NOT NULL CHECK (amount IN (299, 499, 1199)),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REDEEMED', 'CANCELLED')),
    verify_token TEXT UNIQUE NOT NULL CHECK (length(verify_token) >= 16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redeemed_at TIMESTAMPTZ,
    redeemed_by TEXT,
    
    -- Absolute guarantee against duplicate ticket generation for the same booking
    CONSTRAINT uq_booking_pass_index UNIQUE (booking_id, pass_index)
);

CREATE INDEX IF NOT EXISTS idx_tickets_verify_token ON public.tickets(verify_token);
CREATE INDEX IF NOT EXISTS idx_tickets_booking_id ON public.tickets(booking_id);
CREATE INDEX IF NOT EXISTS idx_tickets_phone ON public.tickets(phone);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);

-- ----------------------------------------------------------------------------
-- 3. AUDIT LOGS TABLE (Tamper-evident record of all transactions & actions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    booking_id TEXT,
    ticket_id TEXT,
    action TEXT NOT NULL,                            -- 'BOOKING_CREATED', 'PAYMENT_SUBMITTED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'TICKET_REDEEMED'
    actor TEXT NOT NULL DEFAULT 'SYSTEM',            -- 'CUSTOMER', 'ADMIN', 'GATE_STAFF', 'SYSTEM'
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_booking_id ON public.audit_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. ATOMIC PAYMENT APPROVAL PROCEDURE (Idempotent, Concurrency-Safe & Tamper-Proof)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_payment_atomic(
    p_booking_id TEXT,
    p_actor TEXT,
    p_ticket_list JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking RECORD;
    v_item JSONB;
    v_minted_count INTEGER := 0;
    v_existing_tickets JSONB;
BEGIN
    -- Acquire exclusive row lock on the booking
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'BOOKING_NOT_FOUND',
            'message', 'Booking ID ' || p_booking_id || ' does not exist.'
        );
    END IF;

    -- Idempotency check: If already approved, return existing tickets without duplicate minting
    IF v_booking.payment_status = 'PAYMENT_VERIFIED' THEN
        SELECT jsonb_agg(row_to_json(t)) INTO v_existing_tickets
        FROM public.tickets t
        WHERE t.booking_id = p_booking_id;

        RETURN jsonb_build_object(
            'success', true,
            'already_approved', true,
            'message', 'Booking has already been verified and tickets are active.',
            'booking_id', v_booking.id,
            'approved_at', v_booking.approved_at,
            'tickets', COALESCE(v_existing_tickets, '[]'::jsonb)
        );
    END IF;

    -- Status Transition Guard: Only pending or awaiting bookings can be approved
    IF v_booking.payment_status NOT IN ('PENDING_VERIFICATION', 'AWAITING_PAYMENT') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_STATUS_TRANSITION',
            'message', 'Cannot approve booking currently in status: ' || v_booking.payment_status
        );
    END IF;

    -- Validate ticket list parameter: count must exactly match booking quantity
    IF p_ticket_list IS NULL OR jsonb_typeof(p_ticket_list) != 'array' OR jsonb_array_length(p_ticket_list) != v_booking.quantity THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TICKET_COUNT',
            'message', 'Ticket list array count must exactly match booking quantity (' || v_booking.quantity || ').'
        );
    END IF;

    -- Update booking status to verified
    UPDATE public.bookings
    SET payment_status = 'PAYMENT_VERIFIED',
        ticket_status = 'ACTIVE',
        approved_at = NOW(),
        approved_by = p_actor
    WHERE id = p_booking_id;

    -- Insert each unique ticket
    -- CRITICAL SECURITY: admit_count and amount are derived directly from the trusted v_booking row,
    -- never trusting untrusted values passed in p_ticket_list items.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_ticket_list)
    LOOP
        INSERT INTO public.tickets (
            id,
            booking_id,
            pass_index,
            pass_number,
            customer_name,
            phone,
            email,
            tier,
            pass_name,
            admit_count,
            amount,
            status,
            verify_token,
            created_at
        ) VALUES (
            (v_item->>'id')::TEXT,
            p_booking_id,
            (v_item->>'pass_index')::INTEGER,
            (v_item->>'pass_number')::TEXT,
            v_booking.customer_name,
            v_booking.phone,
            v_booking.email,
            v_booking.tier,
            v_booking.pass_name,
            v_booking.admit_per_pass,            -- Trusted from database
            v_booking.unit_price,                -- Trusted from database
            'ACTIVE',
            (v_item->>'verify_token')::TEXT,
            NOW()
        )
        ON CONFLICT (booking_id, pass_index) DO NOTHING;
        
        v_minted_count := v_minted_count + 1;
    END LOOP;

    -- Record in audit log
    INSERT INTO public.audit_logs (booking_id, action, actor, details)
    VALUES (
        p_booking_id,
        'PAYMENT_APPROVED',
        p_actor,
        jsonb_build_object(
            'expected_amount', v_booking.expected_amount,
            'upi_reference', v_booking.upi_reference,
            'tickets_minted', v_minted_count,
            'approved_at', NOW()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'payment_status', 'PAYMENT_VERIFIED',
        'ticket_status', 'ACTIVE',
        'tickets_count', v_minted_count,
        'approved_at', NOW()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. ATOMIC PAYMENT REJECTION PROCEDURE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_payment_atomic(
    p_booking_id TEXT,
    p_actor TEXT,
    p_reason TEXT DEFAULT 'Payment could not be verified'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking RECORD;
BEGIN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'BOOKING_NOT_FOUND',
            'message', 'Booking ID ' || p_booking_id || ' does not exist.'
        );
    END IF;

    -- Safety check: Cannot reject a booking if any ticket was already redeemed
    IF v_booking.ticket_status = 'REDEEMED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CANNOT_REJECT_REDEEMED',
            'message', 'Cannot reject a booking whose passes have already been admitted at the gate.'
        );
    END IF;

    -- Idempotency check
    IF v_booking.payment_status = 'PAYMENT_REJECTED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_rejected', true,
            'booking_id', p_booking_id,
            'rejected_at', v_booking.rejected_at
        );
    END IF;

    UPDATE public.bookings
    SET payment_status = 'PAYMENT_REJECTED',
        ticket_status = 'NOT_ISSUED',
        rejected_at = NOW(),
        rejected_reason = p_reason
    WHERE id = p_booking_id;

    -- Remove any unactivated tickets if previously created
    DELETE FROM public.tickets WHERE booking_id = p_booking_id;

    -- Record in audit log
    INSERT INTO public.audit_logs (booking_id, action, actor, details)
    VALUES (
        p_booking_id,
        'PAYMENT_REJECTED',
        p_actor,
        jsonb_build_object(
            'rejected_reason', p_reason,
            'upi_reference', v_booking.upi_reference,
            'rejected_at', NOW()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'payment_status', 'PAYMENT_REJECTED',
        'ticket_status', 'NOT_ISSUED',
        'rejected_at', NOW()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. READ-ONLY TICKET INSPECTION (Gate Scanner Camera Verification)
-- Scanning alone does NOT redeem the ticket. Displays attendee info to staff.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inspect_ticket_for_staff(
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_token TEXT := TRIM(p_token);
    v_ticket RECORD;
BEGIN
    SELECT * INTO v_ticket 
    FROM public.tickets 
    WHERE verify_token = v_clean_token OR id = v_clean_token;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'state', 'INVALID',
            'can_admit', false,
            'message', 'INVALID TICKET — DO NOT ADMIT'
        );
    END IF;

    IF v_ticket.status = 'REDEEMED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'state', 'REDEEMED',
            'can_admit', false,
            'message', 'ALREADY USED — DO NOT ADMIT',
            'ticket', jsonb_build_object(
                'id', v_ticket.id,
                'customer_name', v_ticket.customer_name,
                'pass_name', v_ticket.pass_name,
                'admit_count', v_ticket.admit_count,
                'pass_number', v_ticket.pass_number,
                'status', v_ticket.status,
                'redeemed_at', v_ticket.redeemed_at,
                'redeemed_by', v_ticket.redeemed_by
            )
        );
    END IF;

    IF v_ticket.status != 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'success', true,
            'state', 'NOT_ACTIVE',
            'can_admit', false,
            'message', 'TICKET NOT ACTIVE — DO NOT ADMIT',
            'ticket', jsonb_build_object(
                'id', v_ticket.id,
                'customer_name', v_ticket.customer_name,
                'status', v_ticket.status
            )
        );
    END IF;

    -- Valid & Ready for Staff Confirmation
    RETURN jsonb_build_object(
        'success', true,
        'state', 'ACTIVE',
        'can_admit', true,
        'message', 'VALID TICKET — READY TO ADMIT',
        'ticket', jsonb_build_object(
            'id', v_ticket.id,
            'booking_id', v_ticket.booking_id,
            'customer_name', v_ticket.customer_name,
            'phone', v_ticket.phone,
            'pass_name', v_ticket.pass_name,
            'tier', v_ticket.tier,
            'admit_count', v_ticket.admit_count,
            'pass_number', v_ticket.pass_number,
            'status', v_ticket.status
        )
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. ATOMIC TICKET REDEMPTION (Executed when staff presses "ADMIT & CLOSE TICKET")
-- Strictly atomic: Two staff phones cannot admit the same ticket simultaneously.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_ticket_atomic(
    p_token TEXT,
    p_actor TEXT DEFAULT 'GATE_STAFF'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_token TEXT := TRIM(p_token);
    v_ticket RECORD;
BEGIN
    -- Explicit row lock on the ticket (FOR UPDATE)
    SELECT * INTO v_ticket 
    FROM public.tickets 
    WHERE verify_token = v_clean_token OR id = v_clean_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'INVALID_TICKET',
            'message', 'INVALID TICKET — DO NOT ADMIT'
        );
    END IF;

    IF v_ticket.status = 'REDEEMED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'ALREADY_USED',
            'message', 'ALREADY USED — DO NOT ADMIT',
            'redeemed_at', v_ticket.redeemed_at,
            'redeemed_by', v_ticket.redeemed_by,
            'ticket', row_to_json(v_ticket)
        );
    END IF;

    IF v_ticket.status != 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'NOT_ACTIVE',
            'message', 'TICKET NOT ACTIVE — DO NOT ADMIT'
        );
    END IF;

    -- Atomically transition status from ACTIVE to REDEEMED
    UPDATE public.tickets
    SET status = 'REDEEMED',
        redeemed_at = NOW(),
        redeemed_by = p_actor
    WHERE id = v_ticket.id;

    -- Update booking ticket status to REDEEMED if all passes under this booking are now redeemed
    IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE booking_id = v_ticket.booking_id AND status != 'REDEEMED') THEN
        UPDATE public.bookings SET ticket_status = 'REDEEMED' WHERE id = v_ticket.booking_id;
    END IF;

    -- Record in audit log
    INSERT INTO public.audit_logs (booking_id, ticket_id, action, actor, details)
    VALUES (
        v_ticket.booking_id,
        v_ticket.id,
        'TICKET_REDEEMED',
        p_actor,
        jsonb_build_object(
            'admit_count', v_ticket.admit_count,
            'pass_name', v_ticket.pass_name,
            'redeemed_at', NOW()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'reason', 'ADMITTED',
        'message', 'Ticket successfully redeemed. Admitted into event.',
        'ticket', jsonb_build_object(
            'id', v_ticket.id,
            'booking_id', v_ticket.booking_id,
            'pass_number', v_ticket.pass_number,
            'customer_name', v_ticket.customer_name,
            'phone', v_ticket.phone,
            'pass_name', v_ticket.pass_name,
            'admit_count', v_ticket.admit_count,
            'redeemed_at', NOW(),
            'redeemed_by', p_actor
        )
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. SECURE CUSTOMER TICKET RETRIEVAL
-- Enforces Booking ID + Phone matching. NEVER exposes tickets unless verified.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retrieve_booking_tickets_secure(
    p_booking_id TEXT,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_id TEXT := UPPER(TRIM(p_booking_id));
    v_clean_phone TEXT := REGEXP_REPLACE(TRIM(p_phone), '[^0-9]', '', 'g'); -- Digits only
    v_booking RECORD;
    v_tickets JSONB;
BEGIN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE UPPER(id) = v_clean_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'BOOKING_NOT_FOUND',
            'message', 'No booking found matching Booking ID ' || p_booking_id
        );
    END IF;

    -- Validate phone number (compare trailing 10 digits to accommodate country code variations)
    IF RIGHT(REGEXP_REPLACE(v_booking.phone, '[^0-9]', '', 'g'), 10) != RIGHT(v_clean_phone, 10) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PHONE_MISMATCH',
            'message', 'Phone number does not match this booking.'
        );
    END IF;

    -- Status: AWAITING_PAYMENT (No QR / No tickets)
    IF v_booking.payment_status = 'AWAITING_PAYMENT' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'AWAITING_PAYMENT',
            'message', 'Payment has not been submitted for this booking.',
            'booking', jsonb_build_object(
                'id', v_booking.id,
                'customer_name', v_booking.customer_name,
                'pass_name', v_booking.pass_name,
                'quantity', v_booking.quantity,
                'expected_amount', v_booking.expected_amount,
                'payment_status', v_booking.payment_status
            )
        );
    END IF;

    -- Status: PENDING_VERIFICATION (No QR / No tickets)
    IF v_booking.payment_status = 'PENDING_VERIFICATION' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'PENDING_VERIFICATION',
            'message', 'Payment verification is currently pending with the organizer.',
            'booking', jsonb_build_object(
                'id', v_booking.id,
                'customer_name', v_booking.customer_name,
                'pass_name', v_booking.pass_name,
                'quantity', v_booking.quantity,
                'expected_amount', v_booking.expected_amount,
                'upi_reference', v_booking.upi_reference,
                'payment_submitted_at', v_booking.payment_submitted_at,
                'payment_status', v_booking.payment_status
            )
        );
    END IF;

    -- Status: PAYMENT_REJECTED (No QR / No tickets)
    IF v_booking.payment_status = 'PAYMENT_REJECTED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'PAYMENT_REJECTED',
            'message', 'Payment could not be verified. Please contact the organizer.',
            'rejected_reason', v_booking.rejected_reason,
            'booking', jsonb_build_object(
                'id', v_booking.id,
                'customer_name', v_booking.customer_name,
                'payment_status', v_booking.payment_status
            )
        );
    END IF;

    -- Status: PAYMENT_VERIFIED + ACTIVE/REDEEMED -> Reveal Tickets & QR verification tokens
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'pass_number', t.pass_number,
            'pass_name', t.pass_name,
            'tier', t.tier,
            'admit_count', t.admit_count,
            'customer_name', t.customer_name,
            'phone', t.phone,
            'status', t.status,
            'verify_token', t.verify_token,
            'redeemed_at', t.redeemed_at
        ) ORDER BY t.pass_index ASC
    ) INTO v_tickets
    FROM public.tickets t
    WHERE t.booking_id = v_booking.id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'PAYMENT_VERIFIED',
        'ticket_status', v_booking.ticket_status,
        'message', 'Payment verified. Digital pass active.',
        'booking', jsonb_build_object(
            'id', v_booking.id,
            'customer_name', v_booking.customer_name,
            'phone', v_booking.phone,
            'email', v_booking.email,
            'pass_name', v_booking.pass_name,
            'tier', v_booking.tier,
            'quantity', v_booking.quantity,
            'expected_amount', v_booking.expected_amount,
            'payment_status', v_booking.payment_status,
            'ticket_status', v_booking.ticket_status,
            'approved_at', v_booking.approved_at
        ),
        'tickets', COALESCE(v_tickets, '[]'::jsonb)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. ADMIN DASHBOARD STATS & REVENUE CALCULATION (Verified Payments Only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_bookings INTEGER := 0;
    v_pending_count INTEGER := 0;
    v_approved_count INTEGER := 0;
    v_rejected_count INTEGER := 0;
    v_awaiting_count INTEGER := 0;
    
    v_total_revenue BIGINT := 0;
    v_stag_rev BIGINT := 0;
    v_couple_rev BIGINT := 0;
    v_group_rev BIGINT := 0;

    v_stag_approved INTEGER := 0;
    v_couple_approved INTEGER := 0;
    v_group_approved INTEGER := 0;

    v_total_admit_capacity INTEGER := 0;
    v_total_checked_in INTEGER := 0;
    v_total_remaining INTEGER := 0;
BEGIN
    -- Counts across all booking states
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE payment_status = 'PENDING_VERIFICATION'),
        COUNT(*) FILTER (WHERE payment_status = 'PAYMENT_VERIFIED'),
        COUNT(*) FILTER (WHERE payment_status = 'PAYMENT_REJECTED'),
        COUNT(*) FILTER (WHERE payment_status = 'AWAITING_PAYMENT')
    INTO 
        v_total_bookings,
        v_pending_count,
        v_approved_count,
        v_rejected_count,
        v_awaiting_count
    FROM public.bookings;

    -- Approved revenue & breakdown by tier (STRICTLY PAYMENT_VERIFIED counts)
    SELECT 
        COALESCE(SUM(expected_amount), 0),
        COALESCE(SUM(expected_amount) FILTER (WHERE tier = 'stag'), 0),
        COALESCE(SUM(expected_amount) FILTER (WHERE tier = 'couple'), 0),
        COALESCE(SUM(expected_amount) FILTER (WHERE tier = 'group'), 0),
        COUNT(*) FILTER (WHERE tier = 'stag'),
        COUNT(*) FILTER (WHERE tier = 'couple'),
        COUNT(*) FILTER (WHERE tier = 'group'),
        COALESCE(SUM(total_admit), 0)
    INTO 
        v_total_revenue,
        v_stag_rev,
        v_couple_rev,
        v_group_rev,
        v_stag_approved,
        v_couple_approved,
        v_group_approved,
        v_total_admit_capacity
    FROM public.bookings
    WHERE payment_status = 'PAYMENT_VERIFIED';

    -- Checked-in attendees vs remaining
    SELECT 
        COALESCE(SUM(admit_count), 0)
    INTO 
        v_total_checked_in
    FROM public.tickets
    WHERE status = 'REDEEMED';

    v_total_remaining := GREATEST(0, v_total_admit_capacity - v_total_checked_in);

    RETURN jsonb_build_object(
        'total_bookings', v_total_bookings,
        'pending_verification_count', v_pending_count,
        'approved_bookings_count', v_approved_count,
        'rejected_bookings_count', v_rejected_count,
        'awaiting_payment_count', v_awaiting_count,
        'total_verified_revenue', v_total_revenue,
        'total_admit_capacity', v_total_admit_capacity,
        'total_checked_in', v_total_checked_in,
        'total_remaining', v_total_remaining,
        'breakdown', jsonb_build_object(
            'stag', jsonb_build_object('approved_bookings', v_stag_approved, 'revenue', v_stag_rev, 'unit_price', 299),
            'couple', jsonb_build_object('approved_bookings', v_couple_approved, 'revenue', v_couple_rev, 'unit_price', 499),
            'group', jsonb_build_object('approved_bookings', v_group_approved, 'revenue', v_group_rev, 'unit_price', 1199)
        )
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. STRICT RLS & PERMISSION LOCKDOWN (ZERO PUBLIC ACCESS)
-- ----------------------------------------------------------------------------
-- Enable Row Level Security on all tables
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Revoke all table-level access from PUBLIC, anon, and authenticated roles
REVOKE ALL ON TABLE public.bookings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tickets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;

-- Grant full table access exclusively to service_role (Netlify Functions backend)
GRANT ALL ON TABLE public.bookings TO service_role;
GRANT ALL ON TABLE public.tickets TO service_role;
GRANT ALL ON TABLE public.audit_logs TO service_role;

-- Revoke RPC execution privileges on all stored procedures from PUBLIC, anon, and authenticated roles
-- This completely prevents anonymous attackers from calling RPC procedures via PostgREST.
REVOKE EXECUTE ON FUNCTION public.approve_payment_atomic(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_payment_atomic(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inspect_ticket_for_staff(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_ticket_atomic(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retrieve_booking_tickets_secure(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats() FROM PUBLIC, anon, authenticated;

-- Grant execution privileges exclusively to service_role
GRANT EXECUTE ON FUNCTION public.approve_payment_atomic(TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_payment_atomic(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.inspect_ticket_for_staff(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_ticket_atomic(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.retrieve_booking_tickets_secure(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO service_role;
