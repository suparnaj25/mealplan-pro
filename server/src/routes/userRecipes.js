const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { estimateNutritionFromIngredients } = require('../services/nutritionEstimator');
const { scrapeUrl } = require('../services/urlScraper');
const ai = require('../services/aiService');

const router = express.Router();
router.use(authenticateToken);

// Helper: Sync a user recipe into the main recipes table so the meal planner can use it
function syncToRecipesTable(userRecipe, userId) {
  const externalId = `user-${userId}-${userRecipe.id}`;
  const existing = db.prepare('SELECT id FROM recipes WHERE source = ? AND external_id = ?').get('user', externalId);

  // Estimate nutrition from actual ingredients
  const parsedIngredients = typeof userRecipe.ingredients === 'string'
    ? JSON.parse(userRecipe.ingredients || '[]')
    : (userRecipe.ingredients || []);
  const estimatedNutrition = estimateNutritionFromIngredients(parsedIngredients, userRecipe.servings || 4);

  if (existing) {
    db.prepare(`
      UPDATE recipes SET
        name = ?, description = ?, cuisine = ?, meal_type = ?,
        ingredients = ?, instructions = ?, nutrition = ?,
        prep_time_minutes = ?, cook_time_minutes = ?, servings = ?,
        diet_tags = ?
      WHERE id = ?
    `).run(
      userRecipe.name,
      userRecipe.description,
      userRecipe.cuisine,
      userRecipe.meal_type,
      userRecipe.ingredients,
      userRecipe.instructions,
      JSON.stringify(estimatedNutrition),
      userRecipe.prep_time_minutes,
      userRecipe.cook_time_minutes,
      userRecipe.servings,
      userRecipe.tags || '[]',
      existing.id,
    );
    return existing.id;
  } else {
    const recipeId = uuidv4();
    db.prepare(`
      INSERT INTO recipes
        (id, source, external_id, name, description, cuisine, diet_tags, meal_type,
         ingredients, instructions, nutrition, prep_time_minutes, cook_time_minutes, servings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipeId, 'user', externalId,
      userRecipe.name,
      userRecipe.description,
      userRecipe.cuisine,
      userRecipe.tags || '[]',
      userRecipe.meal_type,
      userRecipe.ingredients,
      userRecipe.instructions,
      JSON.stringify(estimatedNutrition),
      userRecipe.prep_time_minutes,
      userRecipe.cook_time_minutes,
      userRecipe.servings,
    );
    return recipeId;
  }
}

function removeFromRecipesTable(userRecipeId, userId) {
  const externalId = `user-${userId}-${userRecipeId}`;
  db.prepare('DELETE FROM recipes WHERE source = ? AND external_id = ?').run('user', externalId);
}

// GET all user recipes
router.get('/', (req, res) => {
  try {
    const recipes = db.prepare(
      'SELECT * FROM user_recipes WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id);

    // Parse JSON fields
    const parsed = recipes.map((r) => ({
      ...r,
      ingredients: JSON.parse(r.ingredients || '[]'),
      instructions: JSON.parse(r.instructions || '[]'),
      tags: JSON.parse(r.tags || '[]'),
    }));

    res.json({ recipes: parsed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single user recipe
router.get('/:id', (req, res) => {
  try {
    const recipe = db.prepare(
      'SELECT * FROM user_recipes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    res.json({
      recipe: {
        ...recipe,
        ingredients: JSON.parse(recipe.ingredients || '[]'),
        instructions: JSON.parse(recipe.instructions || '[]'),
        tags: JSON.parse(recipe.tags || '[]'),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create recipe
router.post('/', (req, res) => {
  try {
    const {
      name, description, cuisine, mealType,
      ingredients, instructions,
      prepTimeMinutes, cookTimeMinutes, servings,
      tags, sourceText,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Recipe name is required' });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO user_recipes
        (id, user_id, name, description, cuisine, meal_type, ingredients, instructions,
         prep_time_minutes, cook_time_minutes, servings, tags, source_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      name,
      description || null,
      cuisine || null,
      mealType || 'dinner',
      JSON.stringify(ingredients || []),
      JSON.stringify(instructions || []),
      prepTimeMinutes || null,
      cookTimeMinutes || null,
      servings || 4,
      JSON.stringify(tags || []),
      sourceText || null,
    );

    const recipe = db.prepare('SELECT * FROM user_recipes WHERE id = ?').get(id);

    // Sync to main recipes table for meal planner integration
    syncToRecipesTable(recipe, req.user.id);

    res.status(201).json({
      recipe: {
        ...recipe,
        ingredients: JSON.parse(recipe.ingredients || '[]'),
        instructions: JSON.parse(recipe.instructions || '[]'),
        tags: JSON.parse(recipe.tags || '[]'),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update recipe
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare(
      'SELECT * FROM user_recipes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!existing) return res.status(404).json({ error: 'Recipe not found' });

    const {
      name, description, cuisine, mealType,
      ingredients, instructions,
      prepTimeMinutes, cookTimeMinutes, servings,
      tags, sourceText,
    } = req.body;

    db.prepare(`
      UPDATE user_recipes SET
        name = ?, description = ?, cuisine = ?, meal_type = ?,
        ingredients = ?, instructions = ?,
        prep_time_minutes = ?, cook_time_minutes = ?, servings = ?,
        tags = ?, source_text = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      cuisine !== undefined ? cuisine : existing.cuisine,
      mealType || existing.meal_type,
      ingredients ? JSON.stringify(ingredients) : existing.ingredients,
      instructions ? JSON.stringify(instructions) : existing.instructions,
      prepTimeMinutes !== undefined ? prepTimeMinutes : existing.prep_time_minutes,
      cookTimeMinutes !== undefined ? cookTimeMinutes : existing.cook_time_minutes,
      servings || existing.servings,
      tags ? JSON.stringify(tags) : existing.tags,
      sourceText !== undefined ? sourceText : existing.source_text,
      req.params.id,
    );

    const recipe = db.prepare('SELECT * FROM user_recipes WHERE id = ?').get(req.params.id);

    // Sync updates to main recipes table
    syncToRecipesTable(recipe, req.user.id);

    res.json({
      recipe: {
        ...recipe,
        ingredients: JSON.parse(recipe.ingredients || '[]'),
        instructions: JSON.parse(recipe.instructions || '[]'),
        tags: JSON.parse(recipe.tags || '[]'),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST import recipe from URL (Instagram, TikTok, blog, etc.)
router.post('/import-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    if (!ai.isConfigured()) {
      return res.status(503).json({ error: 'AI is not configured. Set OPENAI_API_KEY to use URL import.' });
    }

    // Step 1: Scrape the URL
    console.log(`🔗 Scraping URL: ${url}`);
    const scraped = await scrapeUrl(url);
    console.log(`📄 Scraped: platform=${scraped.platform}, hasStructuredData=${scraped.hasStructuredData}, title="${scraped.ogTitle || scraped.pageTitle}"`);

    // Step 2: AI parses scraped content into a recipe
    const recipe = await ai.parseRecipeFromUrl(scraped);
    console.log(`🍳 AI parsed recipe: "${recipe.name}"`);

    // Return parsed recipe for user review (NOT saved yet)
    res.json({ recipe, scraped: { platform: scraped.platform, ogImage: scraped.ogImage, hasStructuredData: scraped.hasStructuredData } });
  } catch (error) {
    console.error('URL import error:', error);
    res.status(error.message.includes('Invalid URL') || error.message.includes('Failed to fetch') ? 400 : 500)
      .json({ error: error.message || 'Failed to import recipe from URL' });
  }
});

// DELETE recipe
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM user_recipes WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Recipe not found' });

    // Remove from main recipes table
    removeFromRecipesTable(req.params.id, req.user.id);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
