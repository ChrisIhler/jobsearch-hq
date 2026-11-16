# Roadmap and suggestions

## Next up
1. **Email sync on every run:** scheduled agents already read Gmail and Outlook. Have each run post `confirmation`, `interview_invite`, `assessment` and `rejection` events so "Confirmed by email" and "No confirmation" stay current.
2. **Interview prep loop:** each run checks `GET /api/interviews` for `prep_status = requested`, writes a one-page brief (company, product, recent news, the role's must-haves mapped to Chris's verified stories, questions to ask) and sets it to `ready`.
3. **Post-interview prompt:** the evening agent asks for a 1–5 rating and notes on any interview that happened that day, and records them.
4. **Custom domain:** `chrisihler.dev` (about $11 the first year) for the portfolio.

## Connectors worth adding
- **LinkedIn:** there is no public API for applications. Keep using the signed-in browser for Easy Apply and read LinkedIn's confirmation emails for status.
- **Indeed, Wellfound, Built In:** same pattern: apply in the browser, confirm by email.
- **Greenhouse / Ashby / Lever:** public job-board APIs are already used for scanning; candidate-side status pages need sign-in, so email stays the source of truth.
- **Calendar:** create calendar holds for interview invites and read them back into `interviews.scheduled_at`.

## Product ideas
- Response-rate and time-to-reply by category and by source (job board vs. LinkedIn vs. referral).
- Weekly email digest of the public stats for people who were approved through the access form.
- Approved requesters get a read-only link with more detail (company list, pipeline) through a signed, expiring URL.
- CSV export from the admin.
- Cloudflare Access (free) in front of `/admin` for single sign-on in addition to the password.
- GitHub Actions: run `npm test` on every push and deploy on merge to `main`.
- Playwright smoke test of the public page and admin sign-in.
