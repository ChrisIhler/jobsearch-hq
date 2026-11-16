-- JobSearch HQ schema (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS companies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  website    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Other',
  stage        TEXT NOT NULL DEFAULT 'queued' CHECK (stage IN ('queued','applied','interview','offer','rejected','closed')),
  tier         TEXT CHECK (tier IS NULL OR tier IN ('auto','quick','long')),
  applied_date TEXT,            -- YYYY-MM-DD
  applied_by   TEXT,            -- 'Claude' (automatic) or 'Chris'
  ats          TEXT,
  location     TEXT,
  pay          TEXT,
  next_step    TEXT,
  deadline     TEXT,            -- YYYY-MM-DD
  url          TEXT,
  notes        TEXT,
  confirmed_at TEXT,            -- date an email confirmation arrived
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, title)
);
CREATE INDEX IF NOT EXISTS roles_stage ON roles(stage);
CREATE INDEX IF NOT EXISTS roles_applied ON roles(applied_date);
CREATE INDEX IF NOT EXISTS roles_category ON roles(category);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  org        TEXT,
  reason     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','approved','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Everything that happens to an application, from email sync or by hand.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('confirmation','interview_invite','assessment','rejection','offer','follow_up','note')),
  happened_at TEXT NOT NULL,     -- YYYY-MM-DD or ISO timestamp
  source      TEXT,              -- e.g. gmail, outlook, linkedin, manual
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS events_role ON events(role_id);

CREATE TABLE IF NOT EXISTS interviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id      INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  scheduled_at TEXT,             -- ISO timestamp
  round        TEXT,             -- recruiter screen, hiring manager, panel...
  format       TEXT,             -- phone, video, onsite
  interviewer  TEXT,
  prep_status  TEXT NOT NULL DEFAULT 'none' CHECK (prep_status IN ('none','requested','ready')),
  prep_notes   TEXT,             -- research brief written by the prep run
  outcome      TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','advanced','rejected','offer','unknown')),
  rating       INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  feedback     TEXT,             -- how it went, in Chris's words
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS interviews_role ON interviews(role_id);
