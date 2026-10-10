-- Sahara Souq schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ar TEXT DEFAULT '',
  description_en TEXT DEFAULT '',
  price_cents INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 100,
  emoji TEXT DEFAULT '📦',
  category TEXT DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'confirmed',
  total_cents INTEGER NOT NULL,
  shipping_name TEXT NOT NULL,
  shipping_phone TEXT NOT NULL,
  shipping_city TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
