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
UPDATE users SET can_create_main_threads = TRUE WHERE id = 1;
- Frissített SQL struktúra hierarchikus témákhoz

-- Módosítsuk a threads táblát, hogy támogassa a hierarchikus struktúrát
ALTER TABLE threads ADD COLUMN parent_id INTEGER REFERENCES threads(id) ON DELETE CASCADE;
ALTER TABLE threads ADD COLUMN level INTEGER DEFAULT 0;

-- Indexek a jobb teljesítményért
CREATE INDEX idx_threads_parent_id ON threads(parent_id);
CREATE INDEX idx_threads_category_id ON threads(category_id);

-- Alapértelmezett kategóriák beszúrása (opcionális)
INSERT INTO categories (name, description) VALUES 
('Általános', 'Általános témák megvitatása'),
('Technológia', 'Technológiai témák'),
('Hobbi', 'Hobbi és szabadidős tevékenységek');

-- Néhány példa téma (opcionális)
INSERT INTO threads (category_id, title, description, author, level) VALUES 
(1, 'Üdvözlés', 'Üdvözöljük a fórumon!', 'admin', 0),
(2, 'Webfejlesztés', 'Webfejlesztési témák', 'admin', 0);