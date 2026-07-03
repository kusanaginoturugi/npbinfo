CREATE TABLE IF NOT EXISTS fetch_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_url TEXT,
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  duration_ms INTEGER,
  row_count INTEGER DEFAULT 0,
  error TEXT,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fetch_runs_target
  ON fetch_runs (target_type, target_key, fetched_at DESC);

CREATE TABLE IF NOT EXISTS standings_payloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  league TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (year, league, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_standings_payloads_latest
  ON standings_payloads (year, league, fetched_at DESC);

CREATE TABLE IF NOT EXISTS standings_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  league TEXT NOT NULL,
  team_name TEXT NOT NULL,
  rank INTEGER,
  play_game_count INTEGER,
  win INTEGER,
  lose INTEGER,
  draw INTEGER,
  pct REAL,
  games_behind TEXT,
  avg REAL,
  hr INTEGER,
  sb INTEGER,
  ops REAL,
  era REAL,
  der_approx REAL,
  team_json TEXT NOT NULL,
  update_note TEXT,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (year, league, team_name, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_standings_snapshots_latest
  ON standings_snapshots (year, league, fetched_at DESC);

CREATE TABLE IF NOT EXISTS player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  stat_type TEXT NOT NULL,
  league TEXT NOT NULL,
  rank INTEGER,
  player_name TEXT NOT NULL,
  team_name TEXT,
  stats_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (year, stat_type, league, player_name, team_name, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_player_stats_latest
  ON player_stats (year, stat_type, league, fetched_at DESC);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_date TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  league TEXT,
  home_team TEXT,
  away_team TEXT,
  stadium TEXT,
  status TEXT,
  score_home INTEGER,
  score_away INTEGER,
  game_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (game_date, home_team, away_team, stadium, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_games_month
  ON games (year, month, game_date);

CREATE INDEX IF NOT EXISTS idx_games_latest
  ON games (year, month, fetched_at DESC);

CREATE TABLE IF NOT EXISTS team_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  league TEXT NOT NULL,
  team_name TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL,
  metric_json TEXT,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (year, league, team_name, metric_name, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_team_metrics_latest
  ON team_metrics (year, league, metric_name, fetched_at DESC);
