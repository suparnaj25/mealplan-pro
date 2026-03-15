const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// Use DATABASE_PATH env var if set (for persistent disk mounts), otherwise default to local data dir
const dataDir = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'mealplan.db');
console.log(`📁 Migration DB path: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migration = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  household_size INTEGER DEFAULT 1,
  budget_preference TEXT DEFAULT 'moderate',
  onboarding_completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_meal_structure (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  breakfast INTEGER DEFAULT 1,
  lunch INTEGER DEFAULT 1,
  dinner INTEGER DEFAULT 1,
  snacks INTEGER DEFAULT 0,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_diet_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  diets TEXT DEFAULT '[]',
  custom_diet TEXT,
  allergies TEXT DEFAULT '[]',
  restrictions TEXT DEFAULT '[]',
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_macros (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  calories INTEGER,
  protein_g INTEGER,
  carbs_g INTEGER,
  fat_g INTEGER,
  fiber_g INTEGER,
  sodium_mg INTEGER,
  sugar_g INTEGER,
  macro_preset TEXT DEFAULT 'balanced',
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_ingredient_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  disliked_ingredients TEXT DEFAULT '[]',
  loved_ingredients TEXT DEFAULT '[]',
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_cuisine_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  favorite_cuisines TEXT DEFAULT '[]',
  avoided_cuisines TEXT DEFAULT '[]',
  variety_preference INTEGER DEFAULT 5,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_recipe_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  api_key TEXT,
  base_url TEXT,
  enabled INTEGER DEFAULT 1,
  UNIQUE(user_id, source_name)
);

CREATE TABLE IF NOT EXISTS user_store_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  primary_store TEXT DEFAULT 'amazon_wholefoods',
  kroger_access_token TEXT,
  kroger_refresh_token TEXT,
  kroger_token_expires_at TEXT,
  kroger_location_id TEXT,
  organic_preference TEXT DEFAULT 'no_preference',
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'builtin',
  external_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  cuisine TEXT,
  diet_tags TEXT DEFAULT '[]',
  meal_type TEXT,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]',
  nutrition TEXT DEFAULT '{}',
  image_url TEXT,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  servings INTEGER DEFAULT 4,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  week_start_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS meal_plan_items (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT REFERENCES meal_plans(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_type TEXT NOT NULL,
  recipe_id TEXT REFERENCES recipes(id),
  locked INTEGER DEFAULT 0,
  servings INTEGER DEFAULT 1,
  scale_factor REAL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS pantry_items (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  category TEXT,
  expiry_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grocery_lists (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  meal_plan_id TEXT REFERENCES meal_plans(id) ON DELETE SET NULL,
  store TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grocery_list_items (
  id TEXT PRIMARY KEY,
  grocery_list_id TEXT REFERENCES grocery_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  category TEXT,
  checked INTEGER DEFAULT 0,
  in_pantry INTEGER DEFAULT 0,
  amazon_search_url TEXT,
  store_product_id TEXT
);

CREATE TABLE IF NOT EXISTS meal_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  recipe_name TEXT,
  recipe_id TEXT,
  status TEXT DEFAULT 'planned',
  actual_description TEXT,
  calories INTEGER DEFAULT 0,
  protein_g INTEGER DEFAULT 0,
  carbs_g INTEGER DEFAULT 0,
  fat_g INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_weight (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight REAL,
  unit TEXT DEFAULT 'lb',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS user_recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cuisine TEXT,
  meal_type TEXT DEFAULT 'dinner',
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]',
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  servings INTEGER DEFAULT 4,
  tags TEXT DEFAULT '[]',
  source_text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`;

console.log('🔄 Running database migrations...');
try {
  db.exec(migration);
  // Add scale_factor to existing meal_plan_items tables (safe if column already exists)
  try { db.exec('ALTER TABLE meal_plan_items ADD COLUMN scale_factor REAL DEFAULT 1.0'); } catch(e) { /* column already exists */ }
  // Add dietary compliance cache to recipes (stores JSON of restriction→boolean pairs)
  try { db.exec('ALTER TABLE recipes ADD COLUMN dietary_compliance TEXT DEFAULT NULL'); } catch(e) { /* column already exists */ }
  console.log('✅ Migrations completed successfully');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}