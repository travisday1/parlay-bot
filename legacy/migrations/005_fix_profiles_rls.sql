-- ============================================================
-- FIX: Infinite recursion in profiles RLS policy
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/civkjfswgtvjxxqquxqb/sql/new
-- ============================================================

-- Step 1: Create a helper function that bypasses RLS to check admin status
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (SELECT is_admin FROM public.profiles WHERE id = user_id),
        FALSE
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Step 2: Drop the broken policies
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert for new users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Step 3: Recreate policies using the helper function (no recursion!)
-- Users can always read their own profile
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Admins can read ALL profiles (uses helper function to avoid recursion)
CREATE POLICY "Admins can read all profiles" ON public.profiles
    FOR SELECT USING (public.is_admin(auth.uid()));

-- Admins can update ALL profiles
CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE USING (public.is_admin(auth.uid()));

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Allow insert for new users (signup trigger)
CREATE POLICY "Allow insert for new users" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
