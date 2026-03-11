const express = require('express');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { getAllStores } = require('../services/storeLinkGenerator');
const { searchExternalRecipes, getAvailableAdapters } = require('../services/recipeAdapters');

const router = express.Router();

const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

router.get('/stores/all', (req, res) => {
  try { res.json({ stores: getAllStores() }); }
  catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/search', authenticateToken, (req, res) => {
  try {
    const { q, mealType, cuisine, diet, limit = 20, offset = 0 } = req.query;
    let sql = 'SELECT * FROM recipes WHERE 1=1';
    const params = [];

    if (q) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (mealType) { sql += ' AND meal_type = ?'; params.push(mealType); }
    if (cuisine) { sql += ' AND cuisine = ?'; params.push(cuisine); }
    sql += ' ORDER BY name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const recipes = db.prepare(sql).all(...params);
    res.json({ recipes: recipes.map(r => ({ ...r, diet_tags: parseJSON(r.diet_tags, []), ingredients: parseJSON(r.ingredients, []), instructions: parseJSON(r.instructions, []), nutrition: parseJSON(r.nutrition, {}) })), total: recipes.length });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/recipes/external/search — search external recipe APIs
router.get('/external/search', authenticateToken, async (req, res) => {
  try {
    const { q, diet, cuisine } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

    // Get user's enabled recipe sources
    const sources = db.prepare('SELECT source_name, api_key, enabled FROM user_recipe_sources WHERE user_id = ?').all(req.user.id);
    const result = await searchExternalRecipes(q, sources, { diet, cuisine });
    res.json(result);
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/recipes/external/adapters — list available recipe API adapters
router.get('/external/adapters', (req, res) => {
  res.json({ adapters: getAvailableAdapters() });
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const r = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ recipe: { ...r, diet_tags: parseJSON(r.diet_tags, []), ingredients: parseJSON(r.ingredients, []), instructions: parseJSON(r.instructions, []), nutrition: parseJSON(r.nutrition, {}) } });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;