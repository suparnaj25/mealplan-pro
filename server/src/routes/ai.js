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

// POST /api/ai/analyze-photo — Vision-based food photo analysis
router.post('/analyze-photo', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) required' });
    const result = await ai.analyzePhoto(image);
    res.json(result);
  } catch (error) {
    console.error('AI analyze-photo error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/parse-food — Natural language food → nutrition
router.post('/parse-food', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'description required' });
    const result = await ai.parseFoodDescription(description);
    res.json(result);
  } catch (error) {
    console.error('AI parse-food error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/explain-plan — Personalized meal plan summary
router.post('/explain-plan', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.explainMealPlan(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI explain-plan error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/optimize-grocery — Smart grocery list optimization
router.post('/optimize-grocery', async (req, res) => {
  try {
    const { items, store, budget, organic } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'items required' });
    const result = await ai.optimizeGroceryList(items, { store, budget, organic });
    res.json(result);
  } catch (error) {
    console.error('AI optimize-grocery error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai/pantry-alerts — Expiry alerts with AI suggestions
router.get('/pantry-alerts', async (req, res) => {
  try {
    const now = new Date();
    const items = db.prepare('SELECT * FROM pantry_items WHERE user_id = ? AND expiry_date IS NOT NULL ORDER BY expiry_date').all(req.user.id);
    const expiring = items.filter(i => {
      const exp = new Date(i.expiry_date + 'T23:59:59');
      const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 5;
    }).map(i => {
      const exp = new Date(i.expiry_date + 'T23:59:59');
      return { ...i, daysLeft: Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) };
    });

    if (expiring.length === 0) return res.json({ alerts: [], mealIdea: null, tip: 'Nothing expiring soon — nice work keeping your pantry fresh! 🌿' });

    const result = await ai.pantryExpiryAlerts(expiring, req.user.id);
    res.json(result);
  } catch (error) {
    console.error('AI pantry-alerts error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/recipe-enhance — Cooking tips, healthier version, pairings
router.post('/recipe-enhance', async (req, res) => {
  try {
    const { recipeId, type } = req.body;
    if (!recipeId || !type) return res.status(400).json({ error: 'recipeId and type required' });
    if (!['cooking-tips', 'make-healthier', 'pairings'].includes(type)) return res.status(400).json({ error: 'type must be cooking-tips, make-healthier, or pairings' });

    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    // Parse JSON fields from DB
    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const parsed = {
      ...recipe,
      ingredients: parseJSON(recipe.ingredients, []),
      instructions: parseJSON(recipe.instructions, []),
      nutrition: parseJSON(recipe.nutrition, {}),
    };

    const result = await ai.getRecipeEnhancements(parsed, type);
    res.json(result);
  } catch (error) {
    console.error('AI recipe-enhance error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/meal-prep — Generate meal prep guide
router.post('/meal-prep', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.generateMealPrepGuide(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI meal-prep error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/trends — Multi-week trend analysis
router.post('/trends', async (req, res) => {
  try {
    const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id);
    const targets = {
      calories: macros?.calories || 2000,
      protein: macros?.protein_g || 150,
      carbs: macros?.carbs_g || 200,
      fat: macros?.fat_g || 67,
    };

    // Get last 4 weeks of data
    const weeks = [];
    for (let w = 0; w < 4; w++) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (w * 7 + startDate.getDay() - 1));
      const weekStart = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;

      const logs = db.prepare("SELECT date, SUM(calories) as cal, SUM(protein_g) as prot, SUM(carbs_g) as carbs, SUM(fat_g) as fat FROM meal_logs WHERE user_id = ? AND date >= ? AND date <= ? AND status IN ('eaten','modified') GROUP BY date").all(req.user.id, weekStart, weekEnd);

      if (logs.length > 0) {
        const avgCal = Math.round(logs.reduce((s, l) => s + l.cal, 0) / logs.length);
        const avgProt = Math.round(logs.reduce((s, l) => s + l.prot, 0) / logs.length);
        const avgCarbs = Math.round(logs.reduce((s, l) => s + l.carbs, 0) / logs.length);
        const avgFat = Math.round(logs.reduce((s, l) => s + l.fat, 0) / logs.length);
        weeks.push({ weekStart, daysLogged: logs.length, avgCalories: avgCal, avgProtein: avgProt, avgCarbs, avgFat });
      }
    }

    if (weeks.length < 2) return res.json({ summary: 'Need at least 2 weeks of data for trend analysis. Keep logging!', patterns: [], predictions: [] });

    const result = await ai.analyzeTrends(weeks, targets);
    res.json(result);
  } catch (error) {
    console.error('AI trends error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
