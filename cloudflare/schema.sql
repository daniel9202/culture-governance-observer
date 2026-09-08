PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('candidate', 'civic_call')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  city TEXT NOT NULL DEFAULT '',
  subject_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL DEFAULT '',
  published_date TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  reviewer_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS review_items_source_url_idx ON review_items(source_url);
CREATE INDEX IF NOT EXISTS review_items_status_kind_idx ON review_items(status, kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS review_events_item_idx ON review_events(item_id, created_at DESC);
