const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const recipes = require('../data/additional-recipes.json');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'mealplan.db'));
db.pragma('journal_mode = WAL');

console.log('🌱 Seeding additional recipes...');
let count = 0;

const tx = db.transaction(() => {
  for (const recipe of recipes) {
    const extId = recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existing = db.prepare('SELECT id FROM recipes WHERE source = ? AND external_id = ?').get('builtin', extId);
    if (!existing) {
      db.prepare('INSERT INTO recipes (id, source, external_id, name, description, cuisine, diet_tags, meal_type, ingredients, instructions, nutrition, prep_time_minutes, cook_time_minutes, servings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        uuidv4(), 'builtin', extId, recipe.name, recipe.description, recipe.cuisine,
        JSON.stringify(recipe.diet_tags), recipe.meal_type, JSON.stringify(recipe.ingredients),
        JSON.stringify(recipe.instructions), JSON.stringify(recipe.nutrition),
        recipe.prep_time_minutes, recipe.cook_time_minutes, recipe.servings
      );
      count++;
    }
  }
});

try {
  tx();
  console.log(`✅ Added ${count} new recipes`);
  const counts = db.prepare('SELECT meal_type, COUNT(*) as c FROM recipes GROUP BY meal_type').all();
  console.log('Total recipes by type:', counts);
} catch (error) {
  console.error('❌ Failed:', error.message);
} finally {
  db.close();
}