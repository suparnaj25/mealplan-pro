const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const ai = require('../services/aiService');
const db = require('../db/connection');

const router = express.Router();
router.use(authenticateToken);

// GET /api/ai/status — check if AI is configured
router.get('/status', (req, res) => {
  res.json({ configured: ai.isConfigured() });
});

// POST /api/ai/optimize — Feature 2: Smart Meal Plan Optimization
router.post('/optimize', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.optimizeMealPlan(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI optimize error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/chat — Feature 3: Natural Language Chat
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const response = await ai.mealPlanChat(req.user.id, message, history);
    res.json({ response });
  } catch (error) {
    console.error('AI chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/substitutions — Feature 4: Ingredient Substitution
router.post('/substitutions', async (req, res) => {
  try {
    const { recipeId } = req.body;
    if (!recipeId) return res.status(400).json({ error: 'recipeId required' });
    const result = await ai.getSubstitutions(req.user.id, recipeId);
    res.json(result);
  } catch (error) {
    console.error('AI substitutions error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai/what-can-i-make — Feature 5: Pantry-Aware Suggestions
router.get('/what-can-i-make', async (req, res) => {
  try {
    const result = await ai.whatCanIMake(req.user.id);
    res.json(result);
  } catch (error) {
    console.error('AI what-can-i-make error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/budget — Feature 6: Budget Estimator
router.post('/budget', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.estimateBudget(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI budget error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/nutrition-report — Feature 7: Nutrition Insights
router.post('/nutrition-report', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.nutritionInsights(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI nutrition error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/generate-recipe — #4: AI Recipe Generation
router.post('/generate-recipe', async (req, res) => {
  try {
    const { mealType, macroTargets } = req.body;
    if (!mealType) return res.status(400).json({ error: 'mealType required' });

    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const diets = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(req.user.id);
    const cuisines = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(req.user.id);
    const restrictions = diets ? parseJSON(diets.restrictions, []) : [];
    const cuisinePrefs = cuisines ? parseJSON(cuisines.favorite_cuisines, []) : [];

    const result = await ai.generateRecipe(mealType, restrictions, macroTargets || {}, cuisinePrefs);
    res.json(result);
  } catch (error) {
    console.error('AI generate-recipe error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/interpret-diet — #7: AI Dietary Interpretation
router.post('/interpret-diet', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = await ai.interpretDietaryInput(text);
    res.json(result);
  } catch (error) {
    console.error('AI interpret-diet error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/calculate-macros — #8: AI Macro Calculator
router.post('/calculate-macros', async (req, res) => {
  try {
    const { profile } = req.body;
    if (!profile) return res.status(400).json({ error: 'profile required' });
    const result = await ai.calculatePersonalizedMacros(profile);
    res.json(result);
  } catch (error) {
    console.error('AI calculate-macros error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/search-terms — #2: AI Recipe Discovery
router.post('/search-terms', async (req, res) => {
  try {
    const { mealType } = req.body;
    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const diets = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(req.user.id);
    const cuisines = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(req.user.id);
    const restrictions = diets ? parseJSON(diets.restrictions, []) : [];
    const cuisinePrefs = cuisines ? parseJSON(cuisines.favorite_cuisines, []) : [];

    const terms = await ai.generateSearchTerms(mealType || 'dinner', restrictions, cuisinePrefs);
    res.json({ terms });
  } catch (error) {
    console.error('AI search-terms error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
