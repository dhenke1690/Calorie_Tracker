# Calorie Tracker

A React + Vite web app for tracking calories and macros across breakfast, morning snack, lunch, afternoon snack, and dinner.

This repo includes:
- Supabase Auth for user-specific meal tracking
- Supabase database storage for meal entries
- Supabase Edge Function for secure Claude AI macro estimation
- A dashboard with stacked meal calorie charts and macro trend lines

## Features

- Sign in or sign up with Supabase Auth
- Save meal entries per user across devices
- Track calories, protein, carbs, and fat for each meal
- Use Claude AI through a secure Supabase Edge Function
- View 14-day calorie and macro trends

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create Supabase table

In your Supabase project, create a new table using this SQL:

```sql
create table meal_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  entry_date date not null,
  meal_slot text not null,
  description text,
  calories int default 0 not null,
  protein int default 0 not null,
  carbs int default 0 not null,
  fat int default 0 not null,
  created_at timestamptz default now()
);

create unique index meal_entries_user_date_slot_idx on meal_entries (user_id, entry_date, meal_slot);
```

### 3. Enable Auth and RLS

Enable Row Level Security (RLS) on `meal_entries` for user-specific access. Use this policy:

```sql
alter table meal_entries enable row level security;

create policy "Users can manage own entries"
  on meal_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### 4. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SUPABASE_FUNCTIONS_URL=https://your-project.functions.supabase.co
```

For the Supabase Edge Function, add the following in the Supabase project settings or CLI environment:

- `SUPABASE_URL=https://your-project.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`
- `CLAUDE_API_KEY=your-claude-api-key`

## 5. Deploy the Edge Function

Create a Supabase Edge Function named `claude` with the code in `supabase/functions/claude/index.ts`.

Then deploy it with the Supabase CLI:

```bash
supabase functions deploy claude
```

## 6. Run the app locally

If you only want the frontend locally, run:

```bash
npm run dev
```

The frontend will use Supabase Auth and call the Edge Function for Claude.

## Deployment Notes

- The React frontend can be deployed to GitHub Pages or any static host.
- The app stores all meal data in Supabase per authenticated user.
- The Claude API key is kept secure inside the Supabase Edge Function.
- If you deploy Supabase Edge Functions to a different URL, update `VITE_SUPABASE_FUNCTIONS_URL`.

## Folder Structure

- `src/` — React app source
- `supabase/functions/claude/` — Supabase Edge Function for Claude
- `.env.example` — frontend environment variable template
- `README.md` — setup and deployment instructions

## Supabase Data Model

Each meal entry stores:
- `user_id`
- `entry_date`
- `meal_slot` (breakfast, morningSnack, lunch, afternoonSnack, dinner)
- `description`
- `calories`
- `protein`
- `carbs`
- `fat`

## Claude AI Integration

The app calls the Supabase Edge Function at `/claude`. The function verifies the signed-in user and then forwards the request to Claude with the secret API key.

## Notes

- The dashboard displays the 14 most recent days.
- Users sign in with Supabase Auth, so each account only sees its own meal data.
