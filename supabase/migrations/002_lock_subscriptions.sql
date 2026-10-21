-- ============================================================
-- Migration: 002_lock_subscriptions
-- Description: Lock subscriptions table to tamper-proof premium access
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Drop client INSERT and UPDATE policies
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;

-- 2. Revoke INSERT and UPDATE privileges from authenticated users
-- Subscriptions are created and updated exclusively by server Edge Functions
-- using the Supabase Service Role key (bypass RLS).
REVOKE INSERT, UPDATE ON public.subscriptions FROM authenticated;

-- 3. Revoke SELECT grant from anon users
REVOKE SELECT ON public.subscriptions FROM anon;
