# API

All responses are JSON. Admin endpoints accept the session cookie (browser) or `Authorization: Bearer <API_TOKEN>` (automation).

## Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/public` | Summary filtered by the visibility settings |
| GET | `/api/demo` | Same shape, generated fictional data, `demo: true` |
| POST | `/api/access-request` | `{name, email, org?, reason}` |
| GET | `/healthz` | `{ok: true}` |

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/login` | `{password}` → sets the session cookie (14 days) |
| POST | `/api/logout` | clears it |
| GET | `/api/session` | `{admin: boolean}` |

## Admin

| Method | Path | Body / query |
|---|---|---|
| GET | `/api/meta` | categories, stages, tiers |
| GET | `/api/stats` | full summary (all sections, no company list) |
| GET | `/api/roles` | `?q=&stage=&tier=&category=&company_id=&from=&to=` |
| GET | `/api/roles/:id` | role + events + interviews |
| POST | `/api/roles` | `{company, title, ...}` upsert on company+title |
| POST | `/api/roles/bulk` | array of up to 500 roles |
| PATCH | `/api/roles/:id` | any role fields |
| DELETE | `/api/roles/:id` | |
| POST | `/api/events` | `{role_id | company+title, kind, happened_at, source, detail, scheduled_at?, round?, format?}` |
| GET | `/api/interviews` | |
| POST | `/api/interviews` | `{role_id, scheduled_at?, round?, format?, interviewer?}` |
| PATCH | `/api/interviews/:id` | prep_status, prep_notes, outcome, rating, feedback, … |
| GET | `/api/loose-ends` | computed list |
| GET/POST | `/api/companies` | list / add `{name, website?, notes?}` |
| PATCH | `/api/companies/:id` | |
| GET/PUT | `/api/visibility` | public toggles |
| GET | `/api/requests` · PATCH `/api/requests/:id` | `{status: new|approved|declined}` |

### Example: an agent logs a confirmation email

```bash
curl -X POST "$JHQ_URL/api/events" -H "Authorization: Bearer $JHQ_TOKEN" -H 'Content-Type: application/json' \
  -d '{"company":"GiveCampus","title":"GC GO Partner Success & Implementation Specialist","kind":"confirmation","source":"gmail","happened_at":"2026-11-15"}'
```
