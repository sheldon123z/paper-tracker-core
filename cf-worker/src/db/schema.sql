-- D1 schema for Paper Tracker Core
-- Mirrors SQLAlchemy models from backend/app/models.py
-- Note: api_key_encrypted is always empty in D1 for security

CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  authors TEXT DEFAULT '',
  abstract TEXT DEFAULT '',
  link TEXT UNIQUE,
  source TEXT DEFAULT 'rss',
  published_date TEXT,
  relevance REAL DEFAULT 0.0,
  category TEXT DEFAULT 'Uncategorized',
  is_read INTEGER DEFAULT 0,
  is_favorited INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  arxiv_id TEXT,
  doi TEXT,
  pdf_url TEXT,
  ai_summary TEXT,
  content_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_papers_link ON papers(link);
CREATE INDEX IF NOT EXISTS idx_papers_arxiv_id ON papers(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi);
CREATE INDEX IF NOT EXISTS idx_papers_content_hash ON papers(content_hash);

CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'rss',
  last_fetched TEXT,
  is_active INTEGER DEFAULT 1,
  fetch_interval INTEGER DEFAULT 120,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#3B82F6'
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

CREATE TABLE IF NOT EXISTS paper_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (paper_id) REFERENCES papers(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE INDEX IF NOT EXISTS idx_paper_tags_paper_id ON paper_tags(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_tags_tag_id ON paper_tags(tag_id);

-- Also keep the association table for compatibility
CREATE TABLE IF NOT EXISTS paper_tag_association (
  paper_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (paper_id, tag_id),
  FOREIGN KEY (paper_id) REFERENCES papers(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE IF NOT EXISTS llm_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  display_name TEXT,
  api_key_encrypted TEXT DEFAULT '',
  model_name TEXT NOT NULL,
  base_url TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  icon TEXT DEFAULT 'chat',
  sort_order INTEGER DEFAULT 0,
  is_builtin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id INTEGER,
  session_id TEXT,
  session_type TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (paper_id) REFERENCES papers(id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_paper_id ON chat_messages(paper_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);

CREATE TABLE IF NOT EXISTS global_chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  title TEXT DEFAULT 'New Session',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_global_chat_sessions_session_id ON global_chat_sessions(session_id);

-- Sync metadata table for tracking sync state
CREATE TABLE IF NOT EXISTS _sync_meta (
  table_name TEXT PRIMARY KEY,
  last_sync_at TEXT,
  record_count INTEGER DEFAULT 0
);
