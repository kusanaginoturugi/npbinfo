CREATE TABLE IF NOT EXISTS ai_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  year INTEGER NOT NULL,
  content TEXT NOT NULL,
  model TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (subject_type, subject_key, year, generated_at)
);

CREATE INDEX IF NOT EXISTS idx_ai_comments_latest
  ON ai_comments (subject_type, subject_key, year, generated_at DESC);
