const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use DATABASE_PATH env var if set (for persistent disk mounts), otherwise default to local data dir
const dbDir = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'mealplan.db');
console.log(`📁 Database path: ${dbPath}`);
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;