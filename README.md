# Our Budget: shared expense tracker (free)

Same stack as the habit tracker: a static PWA on GitHub Pages plus Supabase's free tier (login, Postgres, live sync). Cost: $0, no credit card.

## Setup (about 20 minutes)

### 1. Supabase database (5 min)
- **Reuse the habit tracker's Supabase project** if you created one. These tables don't clash with it, and one project used daily never hits the 7-day inactivity pause.
- Otherwise, create a free project at supabase.com.
- Go to **SQL Editor → New query**, paste all of `supabase-setup.sql`, and click **Run**. It is safe to run again.

### 2. Auth settings (2 min)
Go to **Authentication → URL Configuration**:
- In a new project, set **Site URL** to `https://YOURNAME.github.io/budget/`.
- In a shared project, keep the Site URL and add `https://YOURNAME.github.io/budget/` under **Redirect URLs**.
- Optional: turn off **Authentication → Providers → Email → Confirm email**. That skips the confirmation email, and the free tier sends only a few emails per hour.

### 3. Keys (1 min)
Go to **Project Settings → API**. Copy the **Project URL** and the **anon / publishable** key into `config.js`. Never use the `service_role` / secret key.

### 4. GitHub Pages (5 min)
- Create a new **public** repo named `budget` and upload every file in this folder.
- Go to **Settings → Pages → Deploy from branch → main / root**, then tick **Enforce HTTPS**.
- Turn on GitHub 2FA. A takeover of your GitHub account is the main real risk.

### 5. Phones (5 min)
- **You:** open the URL, then **Share → Add to Home Screen** (iPhone Safari) or **⋮ → Install app** (Android Chrome). Create an account, then **Create household**. In Settings, **Copy** the join code.
- **Wife:** open the same URL, install it, create her own account, and **Join household** with the code.

## How it works (Atomic Habits)
| Law | In the app |
|---|---|
| Make it obvious | "Left this month" is the first thing you see. Nudges sit on top. |
| Make it attractive | A logging streak and a "+1 vote" for each entry. A **No-spend day** counts as a vote too. |
| Make it easy | Amount first. One-tap recent places. The category is auto-picked from the place. `20+7.5` adds up a split receipt. |
| Make it satisfying | Green bars and "✓ Logged today". |
| Inversion | Over budget on a want → "make it difficult" (48-hour rule). 5+ visits to one place → "make the cue invisible". |

Rules engine:
- Missed yesterday → "Never miss twice".
- After 7pm with nothing logged → "Close the day".
- A category at 80% or more → daily allowance left.
- Spending runs >15% ahead of the month's pace → warning.
- No budgets set → "Set 3, not 14".
- 7+ day streak → "Don't break the chain".

## Security
- Row Level Security: each household sees only its own rows. Tested with 3 users: an outsider can't read or insert; your partner can't edit or delete your entries, change the join code, or switch households.
- `supabase.js` (v2.118.0, sha256 `ee3be8de…ed3d3`) is hosted in the repo, with no CDN. The CSP allows scripts only from this site and connections only to `*.supabase.co`.
- CSV export blocks spreadsheet formula injection.

## Limits
- Needs a connection to save. If saving fails, the form keeps what you typed so you can retry.
- Categories live in `config.js`. Edit them there, and both phones pick up the change.
- Releasing an update: bump `VERSION` in `sw.js` and `app.js`. Don't overwrite your filled-in `config.js`.
