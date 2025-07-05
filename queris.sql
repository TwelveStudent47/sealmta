-- Adatbázis létrehozása
CREATE DATABASE sealmta;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN reset_token TEXT;

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE threads (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN is_forum_admin BOOLEAN DEFAULT FALSE;
UPDATE users SET is_forum_admin = TRUE WHERE id = 2; -- példa: 1-es ID-jú felhasználó legyen admin
ALTER TABLE users ADD COLUMN can_create_main_threads BOOLEAN DEFAULT FALSE;