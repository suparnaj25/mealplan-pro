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

// POST /api/ai/week-insights — Week-to-date actuals + forecast
router.post('/week-insights', async (req, res) => {
  try {
    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    
    // Get user macros targets
    const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id);
    const targets = {
      calories: macros?.calories || 2000,
      protein: macros?.protein_g || 150,
      carbs: macros?.carbs_g || 200,
      fat: macros?.fat_g || 67,
    };

    // Get current week dates
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const todayIdx = weekDates.indexOf(today);

    // Get logged meals (actuals)
    const logs = db.prepare('SELECT date, meal_type, calories, protein_g, carbs_g, fat_g, status FROM meal_logs WHERE user_id = ? AND date >= ? AND date <= ?')
      .all(req.user.id, weekDates[0], weekDates[6]);

    // Get meal plan (for forecast)
    const weekStart = weekDates[0];
    const plan = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(req.user.id, weekStart);
    let planItems = [];
    if (plan) {
      planItems = db.prepare(`SELECT mpi.day_of_week, mpi.scale_factor, r.nutrition FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ?`).all(plan.id);
    }

    // Calculate actuals (logged days)
    const actuals = { days: 0, calories: 0, protein: 0, carbs: 0, fat: 0 };
    const loggedDates = new Set();
    for (const log of logs) {
      if (log.status === 'eaten' || log.status === 'logged') {
        loggedDates.add(log.date);
        actuals.calories += log.calories || 0;
        actuals.protein += log.protein_g || 0;
        actuals.carbs += log.carbs_g || 0;
        actuals.fat += log.fat_g || 0;
      }
    }
    actuals.days = loggedDates.size;

    // Calculate forecast (actuals + remaining planned)
    const forecast = { ...actuals };
    const remainingDays = todayIdx >= 0 ? 6 - todayIdx : 0;
    for (const item of planItems) {
      if (item.day_of_week > todayIdx) {
        const n = parseJSON(item.nutrition, {});
        const sf = item.scale_factor || 1.0;
        forecast.calories += Math.round((n.calories || 0) * sf);
        forecast.protein += Math.round((n.protein || 0) * sf);
        forecast.carbs += Math.round((n.carbs || 0) * sf);
        forecast.fat += Math.round((n.fat || 0) * sf);
      }
    }
    forecast.days = actuals.days + remainingDays;

    // Use AI to analyze
    const response = await ai.chatCompletion([
      {
        role: 'system',
        content: `Analyze nutrition data and return JSON:
{
  "actualsGrade": "A|B|C|D",
  "actualsSummary": "Brief assessment of week-to-date",
  "forecastGrade": "A|B|C|D",
  "forecastSummary": "Brief forecast assessment",
  "tips": ["tip1", "tip2"],
  "encouragement": "Motivational message"
}
Grade based on proximity to daily targets: A=within 10%, B=20%, C=35%, D=>35%`
      },
      {
        role: 'user',
        content: `Daily targets: ${JSON.stringify(targets)}
Week-to-date actuals (${actuals.days} days logged): avg ${actuals.days > 0 ? Math.round(actuals.calories/actuals.days) : 0} cal, ${actuals.days > 0 ? Math.round(actuals.protein/actuals.days) : 0}g P, ${actuals.days > 0 ? Math.round(actuals.carbs/actuals.days) : 0}g C, ${actuals.days > 0 ? Math.round(actuals.fat/actuals.days) : 0}g F
Forecast (${forecast.days} days, logged + planned): avg ${forecast.days > 0 ? Math.round(forecast.calories/forecast.days) : 0} cal, ${forecast.days > 0 ? Math.round(forecast.protein/forecast.days) : 0}g P, ${forecast.days > 0 ? Math.round(forecast.carbs/forecast.days) : 0}g C, ${forecast.days > 0 ? Math.round(forecast.fat/forecast.days) : 0}g F`
      }
    ], { jsonMode: true, temperature: 0.3, maxTokens: 500 });

    const aiAnalysis = JSON.parse(response);

    res.json({
      targets,
      actuals: {
        ...actuals,
        avgCalories: actuals.days > 0 ? Math.round(actuals.calories / actuals.days) : 0,
        avgProtein: actuals.days > 0 ? Math.round(actuals.protein / actuals.days) : 0,
        avgCarbs: actuals.days > 0 ? Math.round(actuals.carbs / actuals.days) : 0,
        avgFat: actuals.days > 0 ? Math.round(actuals.fat / actuals.days) : 0,
      },
      forecast: {
        ...forecast,
        avgCalories: forecast.days > 0 ? Math.round(forecast.calories / forecast.days) : 0,
        avgProtein: forecast.days > 0 ? Math.round(forecast.protein / forecast.days) : 0,
        avgCarbs: forecast.days > 0 ? Math.round(forecast.carbs / forecast.days) : 0,
        avgFat: forecast.days > 0 ? Math.round(forecast.fat / forecast.days) : 0,
      },
      ai: aiAnalysis,
      weekDates,
      today,
    });
  } catch (error) {
    console.error('Week insights error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
