#!/bin/bash

# Helper script to apply all migrations to your Supabase instance
# Usage: ./run-migrations.sh

echo "🚀 Applying all migrations to Supabase..."
echo ""

# Check if linked
if ! npx supabase link --project-ref $(grep -o 'https://[^.]*' .env.local | sed 's/https:\/\///') 2>/dev/null; then
  echo "⚠️  Not linked to Supabase project"
  echo "Run: npx supabase link --project-ref YOUR_PROJECT_REF"
  exit 1
fi

# Push all migrations
npx supabase db push

echo "✅ Migrations applied!"
echo ""
echo "Next steps:"
echo "1. Visit your Supabase dashboard"
echo "2. Sign up a test user"
echo "3. Manually set is_admin=true in profiles table"
echo "4. Test creating multi-outcome markets!"
