-- Initial schema for Chirp - Twitter clone with LLM moderation

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tweets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  moderation_status TEXT DEFAULT 'pending',
  moderation_tier1 TEXT,
  moderation_tier2 TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL,
  tweet_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, tweet_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tweet_id) REFERENCES tweets(id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tweets_user_id ON tweets(user_id);
CREATE INDEX IF NOT EXISTS idx_tweets_moderation_status ON tweets(moderation_status);
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at);
