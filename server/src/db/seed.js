const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const recipes = require('../data/recipes.json');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'mealplan.db'));
db.pragma('journal_mode = WAL');

console.log('🌱 Seeding database with recipes...');

const insert = db.prepare(`INSERT OR REPLACE INTO recipes (id, source, external_id, name, description, cuisine, diet_tags, meal_type, ingredients, instructions, nutrition, image_url, prep_time_minutes, cook_time_minutes, servings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const tx = db.transaction(() => {
  for (const recipe of recipes) {
    const extId = recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existing = db.prepare('SELECT id FROM recipes WHERE source = ? AND external_id = ?').get('builtin', extId);
    insert.run(
      existing?.id || uuidv4(),
      'builtin',
      extId,
      recipe.name,
      recipe.description,
      recipe.cuisine,
      JSON.stringify(recipe.diet_tags),
      recipe.meal_type,
      JSON.stringify(recipe.ingredients),
      JSON.stringify(recipe.instructions),
      JSON.stringify(recipe.nutrition),
      recipe.image_url || null,
      recipe.prep_time_minutes,
      recipe.cook_time_minutes,
      recipe.servings
    );
  }
});

try {
  tx();
  console.log(`✅ Seeded ${recipes.length} recipes successfully`);
} catch (error) {
  console.error('❌ Seed failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}