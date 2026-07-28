/**
 * Optional Supabase backend for the leaderboard.
 *
 * Leave these empty and the game works exactly as before: results travel in the
 * share text and each player pastes their friends' codes in. Fill them in and
 * the paste step disappears — results post to a shared table and everyone sees
 * the same board.
 *
 * Both values are safe to commit. The anon key is designed to be public; it is
 * the row-level security policies in supabase/setup.sql that decide what it can
 * actually do, which is: insert a score, read scores, nothing else. Run that SQL
 * once in the Supabase SQL editor before filling these in.
 *
 * Never put the service_role key here. That one bypasses every policy.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
