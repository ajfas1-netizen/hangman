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
export const SUPABASE_URL = 'https://gkeemnramnkmrglnayjy.supabase.co';

/**
 * The current-style publishable key. Tried first; if the project rejects it the
 * client falls back to the legacy anon key below, and remembers which worked.
 * Both are safe to publish — the RLS policies are what constrain them.
 */
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2J9GaPurlifR6dpWNLnJng_cbr8TWz_';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrZWVtbnJhbW5rbXJnbG5heWp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTg1MTQsImV4cCI6MjA5OTk3NDUxNH0.bhwCq7d-DB8X2euXR6OMLROX8WpQQ8gIcIoP5azsgGE';
