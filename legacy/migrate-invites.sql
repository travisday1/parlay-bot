-- ============================================================
-- MIGRATION: Pending Invites & Trigger Update
-- Run in Supabase SQL Editor
-- ============================================================

-- 1) Create pending_invites table
CREATE TABLE IF NOT EXISTS public.pending_invites (
    email TEXT PRIMARY KEY,
    granted_tier TEXT NOT NULL DEFAULT 'free',
    granted_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) RLS for pending_invites
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Admins can read/write pending invites
CREATE POLICY "Admins can read pending_invites" ON public.pending_invites
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
        OR auth.uid() IN ('f4128156-bc33-475c-b715-30120b0fb35b')
    );

CREATE POLICY "Admins can insert pending_invites" ON public.pending_invites
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
        OR auth.uid() IN ('f4128156-bc33-475c-b715-30120b0fb35b')
    );

CREATE POLICY "Admins can delete pending_invites" ON public.pending_invites
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
        OR auth.uid() IN ('f4128156-bc33-475c-b715-30120b0fb35b')
    );

-- 3) Update the handle_new_user trigger to apply pending invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    _invite RECORD;
BEGIN
    -- Insert or update the profile
    INSERT INTO public.profiles (id, email, display_name, avatar_url, subscription_tier)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        'free'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

    -- Check for a pending invite and apply the granted tier
    SELECT * INTO _invite FROM public.pending_invites WHERE email = NEW.email LIMIT 1;
    IF FOUND THEN
        UPDATE public.profiles
        SET granted_tier = _invite.granted_tier,
            granted_by = _invite.granted_by,
            granted_at = NOW()
        WHERE id = NEW.id;

        DELETE FROM public.pending_invites WHERE email = NEW.email;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Ensure your admin profile has is_admin = TRUE
-- This lets the existing RLS policies work properly
UPDATE public.profiles
SET is_admin = TRUE
WHERE id = 'f4128156-bc33-475c-b715-30120b0fb35b';
