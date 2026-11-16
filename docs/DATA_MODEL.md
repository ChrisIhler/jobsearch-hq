# Data model (D1 / SQLite)

Full DDL: [`schema.sql`](../schema.sql).

**companies** — `id`, `name` (unique, case-insensitive), `website`, `notes`.

**roles**: one row per company + title.

| column | notes |
|---|---|
| `stage` | `queued` → `applied` → `interview` → `offer`, or `rejected` / `closed` |
| `tier` | for queued roles: `auto` (Claude can submit), `quick` (Tier 1, under ~10 min for Chris), `long` (Tier 2: assessments, videos, essays) |
| `category` | set by `categorize(title)` unless given; one of the eight families in `src/lib.js` |
| `applied_date`, `applied_by` | `applied_by` is `Claude` (automatic) or `Chris` |
| `confirmed_at` | date the confirmation email arrived (set by a `confirmation` event) |
| `next_step`, `deadline` | what the role needs next |
| `location`, `pay`, `ats`, `url`, `notes` | private details, never public |

**events**: timeline per role: `kind` (`confirmation`, `interview_invite`, `assessment`, `rejection`, `offer`, `follow_up`, `note`), `happened_at`, `source` (gmail, outlook, linkedin, manual), `detail`.

**interviews**: `scheduled_at`, `round`, `format`, `interviewer`, `prep_status` (`none`/`requested`/`ready`), `prep_notes`, `outcome` (`pending`/`advanced`/`rejected`/`offer`/`unknown`), `rating` (1–5), `feedback`.

**settings**: key/value; `visibility` holds the public toggles as JSON.

**access_requests**: name, email, org, reason, status (`new`/`approved`/`declined`).

## Loose ends (computed, not stored)

- `deadline`: queued role due within 3 days or overdue
- `feedback_missing`: interview date passed, outcome pending, no feedback
- `prep_pending`: research brief requested, not ready
- `needs_you_quick` / `needs_you_long`: queued Tier 1 / Tier 2 roles
- `no_confirmation`: applied 2+ days ago with no confirmation email
