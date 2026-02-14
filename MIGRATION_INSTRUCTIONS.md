# Database Migration Instructions

## What this does
This migration allows unauthenticated users (visitors who haven't logged in) to view:
- Markets
- Trades
- Leaderboard (profiles)
- Probability charts

Trading, portfolio, and admin features remain protected and require authentication.

## How to apply this migration

### Option 1: Supabase Dashboard (Recommended)

1. Open your Supabase project at https://supabase.com/dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **+ New query**
4. Copy the entire contents of `apply_public_access.sql` and paste it into the editor
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned" - that's good!

### Option 2: Supabase CLI

If you have the Supabase CLI installed and linked to the project:

```bash
supabase db execute -f apply_public_access.sql
```

Or manually:

```bash
supabase login
cd /path/to/timbermarket
psql $DATABASE_URL < apply_public_access.sql
```

## Verification

After applying the migration, test by:
1. Opening the site in an incognito/private browser window (not logged in)
2. You should now see markets, trades, and leaderboard data
3. Trying to access `/portfolio` or `/admin` should still require login

## Troubleshooting

If you still see "No markets yet" after applying:
1. Make sure the migration ran successfully (no errors in SQL Editor)
2. Try refreshing the page (Cmd/Ctrl + Shift + R for hard refresh)
3. Check the browser console for any errors
4. Verify RLS policies were updated:
   ```sql
   SELECT schemaname, tablename, policyname
   FROM pg_policies
   WHERE schemaname = 'public'
   ORDER BY tablename, policyname;
   ```

## Need help?

If issues persist, share:
- Any error messages from the SQL Editor
- Browser console errors (F12 > Console tab)
- Output from the verification query above
