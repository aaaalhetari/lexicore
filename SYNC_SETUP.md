# Cross-Device Sync Setup

LexiCore can sync your progress and settings across all your devices (computer, phone, tablet) using Supabase.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Create a new project
3. In **Settings → API**, copy:
   - **Project URL**
   - **anon public** key

## 2. Configure environment

Create a `.env` file in the project root (copy from `.env.example`):

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 3. Run database migrations

In Supabase **SQL Editor**, run the migration files in `supabase/migrations/` in order (or use `supabase db push` if using Supabase CLI). The schema includes `vocabulary`, `user_settings`, `sessions`, and `refill_jobs`.

## 4. Enable GitHub auth

### 4.1 Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - **Application name**: LexiCore (or any name)
   - **Homepage URL**:  
     - Local: `http://localhost:5174/lexicore/`  
     - Production: `https://aaaalhetari.github.io/lexicore/` (use your deployed URL)
   - **Authorization callback URL**:  
     `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`  
     (Get YOUR_PROJECT_REF from your Supabase Project URL, e.g. `ryknnazacqzmasolhtkc`)
3. Click **Register application**
4. Copy **Client ID** and generate a **Client Secret**

### 4.2 Add GitHub in Supabase

1. In Supabase: **Authentication** → **Providers** → **GitHub**
2. Enable GitHub
3. Paste **Client ID** and **Client Secret** from GitHub
4. Save

### 4.3 Set redirect URLs in Supabase

1. **Authentication** → **URL Configuration**
2. **Site URL**: `https://aaaalhetari.github.io/lexicore/` (or your prod URL)
3. **Redirect URLs**: add both:
   - `http://localhost:5174/lexicore/`
   - `https://aaaalhetari.github.io/lexicore/` (or your prod URL)

## 5. GitHub Pages deployment (optional)

If you deploy to GitHub Pages, add these as **Repository Secrets** so the built app includes Supabase:

1. Go to your repo on GitHub → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**:
   - Name: `VITE_SUPABASE_URL`  
     Value: `https://ryknnazacqzmasolhtkc.supabase.co` (your project URL)
   - Name: `VITE_SUPABASE_ANON_KEY`  
     Value: your anon key from Supabase **Settings → API**

3. Push to `main` — the deploy workflow will use these secrets during build.

## 6. Use sync in the app

- Open **Settings** → tab **Account**
- Click **Sign in with GitHub**
- Authorize on GitHub
- Your progress and settings will sync to the cloud
- On another device, sign in with the same GitHub account to continue where you left off

---

**Note:** If the deployed site shows "Sync requires Supabase", add the secrets in step 5 and push a new commit to trigger a rebuild.
