/**
 * AI Service — Powers all AI features via OpenAI-compatible API
 * Supports: OpenAI, Azure OpenAI, or any compatible endpoint
 * Set OPENAI_API_KEY and optionally OPENAI_BASE_URL in environment
 */

const db = require('../db/connection');

const OPENAI_API_KEY = () => process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = () => process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';

function isConfigured() {
  return !!OPENAI_API_KEY();
}

async function chatCompletion(messages, options = {}) {
  if (!isConfigured()) throw new Error('AI not configured. Set OPENAI_API_KEY in environment.');

  const res = await fetch(`${OPENAI_BASE_URL()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY()}`,
    },
    body: JSON.stringify({
      model: options.model || OPENAI_MODEL(),
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 2000,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI request failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function generateImage(prompt, options = {}) {
  if (!isConfigured()) throw new Error('AI not configured. Set OPENAI_API_KEY in environment.');

  const res = await fetch(`${OPENAI_BASE_URL()}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY()}`,
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL(),
      prompt,
      n: 1,
      size: options.size || '512x512',
      quality: options.quality || 'standard',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Image generation failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.data[0]?.url || data.data[0]?.b64_json;
}

// ── Feature 2: Smart Meal Plan Optimization ──
async function optimizeMealPlan(userId, planId) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(userId);
  const items = db.prepare(`
    SELECT mpi.*, r.name as recipe_name, r.nutrition, r.cuisine, r.meal_type, r.ingredients
    FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mpi.meal_plan_id = ?
    ORDER BY mpi.day_of_week, mpi.meal_type
  `).all(planId);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const planSummary = items.map(i => {
    const sf = i.scale_factor || 1.0;
    const n = parseJSON(i.nutrition, {});
    return {
      day: days[i.day_of_week],
      meal: i.meal_type,
      recipe: i.recipe_name,
      nutrition: { calories: Math.round((n.calories || 0) * sf), protein: Math.round((n.protein || 0) * sf), carbs: Math.round((n.carbs || 0) * sf), fat: Math.round((n.fat || 0) * sf) },
      cuisine: i.cuisine,
      scaleFactor: sf,
    };
  });

  const targetMacros = macros ? {
    calories: macros.calories || 2000,
    protein: macros.protein_g || 150,
    carbs: macros.carbs_g || 200,
    fat: macros.fat_g || 67,
  } : { calories: 2000, protein: 150, carbs: 200, fat: 67 };

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a nutrition and meal planning expert. Analyze the meal plan and provide optimization suggestions. Return JSON with this structure:
{
  "overallScore": 85,
  "dailyAnalysis": [{"day": "Monday", "totalCalories": 1800, "totalProtein": 120, "totalCarbs": 200, "totalFat": 60, "score": 80, "notes": "..."}],
  "suggestions": [{"priority": "high|medium|low", "category": "macros|variety|nutrition|cost", "message": "...", "actionable": "..."}],
  "weeklyTotals": {"avgCalories": 1900, "avgProtein": 140, "avgCarbs": 190, "avgFat": 65},
  "macroBalance": {"caloriesFit": 95, "proteinFit": 93, "carbsFit": 95, "fatFit": 97}
}`
    },
    {
      role: 'user',
      content: `Analyze this weekly meal plan against the user's macro targets.

Target macros (daily): ${JSON.stringify(targetMacros)}

Current meal plan:
${JSON.stringify(planSummary, null, 2)}

Provide a detailed analysis with optimization score, daily breakdown, and actionable suggestions.`
    }
  ], { jsonMode: true, temperature: 0.3 });

  return JSON.parse(response);
}

// ── Feature 3: Natural Language Chat ──
async function mealPlanChat(userId, userMessage, conversationHistory = []) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  // Gather user context
  const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(userId);
  const diets = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(userId);
  const ingredients = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(userId);

  const context = {
    macros: macros ? { calories: macros.calories, protein: macros.protein_g, carbs: macros.carbs_g, fat: macros.fat_g } : null,
    restrictions: diets ? parseJSON(diets.restrictions, []) : [],
    diets: diets ? parseJSON(diets.diets, []) : [],
    disliked: ingredients ? parseJSON(ingredients.disliked_ingredients, []) : [],
    loved: ingredients ? parseJSON(ingredients.loved_ingredients, []) : [],
  };

  const messages = [
    {
      role: 'system',
      content: `You are a friendly, knowledgeable meal planning assistant for MealPlan Pro. You help users with meal planning, nutrition advice, recipe suggestions, and dietary guidance.

User's profile:
- Macro targets: ${JSON.stringify(context.macros)}
- Dietary restrictions: ${context.restrictions.join(', ') || 'None'}
- Diet preferences: ${context.diets.join(', ') || 'None'}
- Disliked ingredients: ${context.disliked.join(', ') || 'None'}
- Loved ingredients: ${context.loved.join(', ') || 'None'}

Be helpful, concise, and practical. If the user asks to modify their meal plan, provide specific recipe suggestions that fit their preferences. Use emojis sparingly for friendliness. Keep responses under 300 words.`
    },
    ...conversationHistory.slice(-10),
    { role: 'user', content: userMessage }
  ];

  const response = await chatCompletion(messages, { temperature: 0.7, maxTokens: 1000 });
  return response;
}

// ── Feature 4: Ingredient Substitution ──
async function getSubstitutions(userId, recipeId) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
  if (!recipe) throw new Error('Recipe not found');

  const diets = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(userId);
  const ingredients = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(userId);
  const pantryItems = db.prepare('SELECT name FROM pantry_items WHERE user_id = ?').all(userId);

  const context = {
    restrictions: diets ? parseJSON(diets.restrictions, []) : [],
    disliked: ingredients ? parseJSON(ingredients.disliked_ingredients, []) : [],
    pantry: pantryItems.map(p => p.name),
  };

  const recipeIngredients = parseJSON(recipe.ingredients, []);

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a culinary substitution expert. Suggest smart ingredient substitutions. Return JSON:
{
  "substitutions": [
    {
      "original": "ingredient name",
      "substitute": "replacement ingredient",
      "reason": "why this works",
      "dietaryBenefit": "e.g., dairy-free, lower calorie",
      "inPantry": true/false,
      "impactOnTaste": "minimal|moderate|significant"
    }
  ]
}`
    },
    {
      role: 'user',
      content: `Recipe: ${recipe.name}
Ingredients: ${JSON.stringify(recipeIngredients.map(i => i.name))}

User's dietary restrictions: ${context.restrictions.join(', ') || 'None'}
User's disliked ingredients: ${context.disliked.join(', ') || 'None'}
User's pantry items: ${context.pantry.join(', ') || 'None'}

Suggest substitutions for ingredients that conflict with restrictions or dislikes, and suggest pantry-based swaps where possible. Only suggest substitutions where meaningful — skip if the ingredient is fine.`
    }
  ], { jsonMode: true, temperature: 0.3 });

  return JSON.parse(response);
}

// ── Feature 5: Pantry-Aware "What Can I Make?" ──
async function whatCanIMake(userId) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  const pantryItems = db.prepare('SELECT name, quantity, unit FROM pantry_items WHERE user_id = ?').all(userId);
  if (pantryItems.length === 0) return { recipes: [], message: 'Your pantry is empty! Add some items first.' };

  const diets = db.prepare('SELECT restrictions FROM user_diet_preferences WHERE user_id = ?').get(userId);
  const restrictions = diets ? parseJSON(diets.restrictions, []) : [];

  const allRecipes = db.prepare('SELECT id, name, ingredients, meal_type, cuisine, nutrition, prep_time_minutes, cook_time_minutes FROM recipes LIMIT 100').all();

  const pantryNames = pantryItems.map(p => p.name.toLowerCase());
  const recipesWithMatch = allRecipes.map(r => {
    const ings = parseJSON(r.ingredients, []);
    const matched = ings.filter(i => pantryNames.some(p => p.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(p)));
    const missing = ings.filter(i => !pantryNames.some(p => p.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(p)));
    return { ...r, matchCount: matched.length, totalIngredients: ings.length, matchPct: ings.length > 0 ? matched.length / ings.length : 0, matched: matched.map(i => i.name), missing: missing.map(i => i.name) };
  }).filter(r => r.matchPct > 0.3).sort((a, b) => b.matchPct - a.matchPct).slice(0, 10);

  // Use AI to rank and provide commentary
  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a creative chef. Given the user's pantry and recipe matches, suggest the best recipes they can make. Return JSON:
{
  "suggestions": [
    {
      "recipeName": "...",
      "matchPercentage": 80,
      "canMakeNow": true/false,
      "missingItems": ["item1"],
      "tip": "short cooking tip or note",
      "difficulty": "easy|medium|hard"
    }
  ],
  "quickMealIdea": "A creative meal idea using just what's in the pantry"
}`
    },
    {
      role: 'user',
      content: `Pantry items: ${pantryItems.map(p => `${p.name} (${p.quantity} ${p.unit})`).join(', ')}
Dietary restrictions: ${restrictions.join(', ') || 'None'}

Top recipe matches:
${recipesWithMatch.map(r => `- ${r.name} (${r.matchCount}/${r.totalIngredients} ingredients matched, missing: ${r.missing.join(', ')})`).join('\n')}`
    }
  ], { jsonMode: true, temperature: 0.5 });

  const aiResult = JSON.parse(response);
  return { ...aiResult, pantryCount: pantryItems.length, recipesAnalyzed: allRecipes.length };
}

// ── Feature 6: Smart Grocery Budget Estimator ──
async function estimateBudget(userId, planId) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  const items = db.prepare(`
    SELECT mpi.*, r.name as recipe_name, r.ingredients, r.servings
    FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mpi.meal_plan_id = ?
  `).all(planId);

  const profile = db.prepare('SELECT budget_preference FROM users WHERE id = ?').get(userId);
  const store = db.prepare('SELECT primary_store, organic_preference FROM user_store_preferences WHERE user_id = ?').get(userId);

  const allIngredients = {};
  for (const item of items) {
    const ings = parseJSON(item.ingredients, []);
    for (const ing of ings) {
      const key = ing.name.toLowerCase();
      if (!allIngredients[key]) {
        allIngredients[key] = { name: ing.name, totalQty: 0, unit: ing.unit, category: ing.category };
      }
      allIngredients[key].totalQty += ing.quantity || 1;
    }
  }

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a grocery budget expert. Estimate costs for a weekly grocery list. Return JSON:
{
  "totalEstimate": 85.50,
  "breakdown": [
    {"category": "Produce", "estimate": 25.00, "itemCount": 8},
    {"category": "Meat & Seafood", "estimate": 30.00, "itemCount": 4}
  ],
  "savingTips": [
    {"tip": "Buy chicken thighs instead of breasts", "savings": 3.50},
    {"tip": "Use frozen vegetables for stir-fry", "savings": 2.00}
  ],
  "budgetRating": "within_budget|slightly_over|over_budget",
  "perMealCost": 4.25,
  "comparisonToAverage": "15% below average for a household of 2"
}`
    },
    {
      role: 'user',
      content: `Estimate grocery costs for this weekly meal plan.

Store: ${store?.primary_store || 'general'}
Organic preference: ${store?.organic_preference || 'no_preference'}
Budget preference: ${profile?.budget_preference || 'moderate'}

Ingredients needed:
${Object.values(allIngredients).map(i => `- ${i.name}: ${i.totalQty} ${i.unit} (${i.category})`).join('\n')}

Provide realistic US grocery price estimates for 2024-2025.`
    }
  ], { jsonMode: true, temperature: 0.3 });

  return JSON.parse(response);
}

// ── Feature 7: Nutrition Insights & Weekly Report ──
async function nutritionInsights(userId, planId) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(userId);
  const items = db.prepare(`
    SELECT mpi.day_of_week, mpi.meal_type, mpi.servings, mpi.scale_factor, r.name as recipe_name, r.nutrition, r.ingredients
    FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mpi.meal_plan_id = ?
    ORDER BY mpi.day_of_week
  `).all(planId);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dailyNutrition = {};
  for (const item of items) {
    const day = days[item.day_of_week];
    if (!dailyNutrition[day]) dailyNutrition[day] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, meals: [] };
    const n = parseJSON(item.nutrition, {});
    // scale_factor adjusts per-serving nutrition to match macro targets
    // This is per-person (each person eats 1 scaled serving)
    const sf = item.scale_factor || 1.0;
    dailyNutrition[day].calories += Math.round((n.calories || 0) * sf);
    dailyNutrition[day].protein += Math.round((n.protein || 0) * sf);
    dailyNutrition[day].carbs += Math.round((n.carbs || 0) * sf);
    dailyNutrition[day].fat += Math.round((n.fat || 0) * sf);
    dailyNutrition[day].fiber += Math.round((n.fiber || 0) * sf);
    dailyNutrition[day].meals.push(`${item.recipe_name} (${sf}x)`);
  }

  const targetMacros = macros ? {
    calories: macros.calories || 2000,
    protein: macros.protein_g || 150,
    carbs: macros.carbs_g || 200,
    fat: macros.fat_g || 67,
  } : { calories: 2000, protein: 150, carbs: 200, fat: 67 };

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a nutrition expert. Grade the meal plan STRICTLY against the user's CUSTOM macro targets (not general dietary guidelines).

GRADING RULES (based on how close daily averages are to USER'S targets):
- Grade A: ALL macros within 10% of user's targets
- Grade B: ALL macros within 20% of user's targets  
- Grade C: Some macros within 20%, some off by 20-35%
- Grade D: Multiple macros off by more than 35%

IMPORTANT: The targets below are the user's PERSONAL goals. Grade ONLY against these numbers, NOT against general nutrition guidelines like "2000 calories" or "50g protein".

Return JSON:
{
  "summary": "Brief 2-sentence overview referencing the user's specific targets",
  "grade": "A|B|C|D",
  "dailyBreakdown": [
    {"day": "Monday", "calories": 1800, "calorieTarget": TARGET_CAL, "verdict": "X% under/over target", "emoji": "⚡"}
  ],
  "weeklyAverages": {"calories": avg, "protein": avg, "carbs": avg, "fat": avg, "fiber": avg},
  "insights": [
    {"type": "positive|warning|tip", "icon": "✅|⚠️|💡", "message": "..."}
  ],
  "micronutrientGaps": ["..."],
  "hydrationReminder": "...",
  "topRecommendation": "..."
}`
    },
    {
      role: 'user',
      content: `Generate a nutrition report for this week.

USER'S PERSONAL MACRO TARGETS (grade against THESE, not general guidelines):
- Daily Calories: ${targetMacros.calories}
- Daily Protein: ${targetMacros.protein}g
- Daily Carbs: ${targetMacros.carbs}g
- Daily Fat: ${targetMacros.fat}g

Daily nutrition breakdown (actual intake, per person):
${JSON.stringify(dailyNutrition, null, 2)}

Grade the plan based on how close the daily averages are to the user's SPECIFIC targets above.`
    }
  ], { jsonMode: true, temperature: 0.3 });

  return JSON.parse(response);
}

// ── Feature 8: AI Recipe Image Generation ──
async function generateRecipeImage(recipeName, description, cuisine) {
  const prompt = `Professional food photography of ${recipeName}. ${description || ''}. ${cuisine ? `${cuisine} cuisine.` : ''} Beautifully plated on a ceramic dish, natural lighting, shallow depth of field, top-down angle, rustic wooden table background. Appetizing, vibrant colors, editorial quality.`;

  const imageUrl = await generateImage(prompt, { size: '512x512' });
  return { imageUrl, prompt };
}

// ── #4: AI Recipe Generation ──
async function generateRecipe(mealType, restrictions, macroTargets, cuisinePrefs) {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a professional chef and nutritionist. Create a complete recipe. Return JSON:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "cuisine": "cuisine type",
  "diet_tags": ["tag1"],
  "meal_type": "${mealType}",
  "ingredients": [{"name": "ingredient", "quantity": 1, "unit": "cup", "category": "Produce"}],
  "instructions": ["Step 1", "Step 2"],
  "nutrition": {"calories": 500, "protein": 30, "carbs": 50, "fat": 20, "fiber": 8},
  "prep_time_minutes": 15,
  "cook_time_minutes": 20,
  "servings": 4
}`
    },
    {
      role: 'user',
      content: `Create a ${mealType} recipe.
Dietary restrictions: ${restrictions.join(', ') || 'None'}
Target nutrition per serving: ~${macroTargets.calories || 500} cal, ~${macroTargets.protein || 30}g protein, ~${macroTargets.carbs || 50}g carbs, ~${macroTargets.fat || 20}g fat
Preferred cuisines: ${cuisinePrefs.join(', ') || 'Any'}
Make it delicious, practical, and precisely matching the nutrition targets.`
    }
  ], { jsonMode: true, temperature: 0.8 });

  return JSON.parse(response);
}

// ── #2: AI Recipe Discovery (search terms) ──
async function generateSearchTerms(mealType, restrictions, cuisinePrefs) {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `Generate search terms for finding recipes. Return JSON: {"terms": ["term1", "term2", "term3", "term4", "term5"]}`
    },
    {
      role: 'user',
      content: `Generate 5 search terms for ${mealType} recipes that are ${restrictions.join(', ') || 'no restrictions'}, preferring ${cuisinePrefs.join(', ') || 'any'} cuisine. Terms should be specific food names, not generic words.`
    }
  ], { jsonMode: true, temperature: 0.9, maxTokens: 100 });

  const result = JSON.parse(response);
  return result.terms || [];
}

// ── #3: AI Meal Distribution ──
async function calculateMealDistribution(userProfile) {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `Calculate optimal calorie distribution across meals. Return JSON:
{"breakfast": 0.25, "lunch": 0.35, "dinner": 0.35, "snack": 0.05}
Values must sum to 1.0.`
    },
    {
      role: 'user',
      content: `User profile: ${JSON.stringify(userProfile)}
Calculate the optimal meal calorie distribution. Consider their lifestyle, activity level, and goals.`
    }
  ], { jsonMode: true, temperature: 0.3, maxTokens: 100 });

  return JSON.parse(response);
}

// ── #7: AI Dietary Interpretation (free-text) ──
async function interpretDietaryInput(userText) {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `Interpret dietary input into structured restrictions. Return JSON:
{
  "restrictions": ["Vegan", "Gluten-Free"],
  "excludeIngredients": ["tomatoes", "peppers", "eggplant"],
  "interpretation": "User has nightshade allergy and is vegan"
}`
    },
    {
      role: 'user',
      content: `Interpret this dietary input: "${userText}". Identify all restrictions, specific ingredients to avoid, and explain your interpretation.`
    }
  ], { jsonMode: true, temperature: 0.2 });

  return JSON.parse(response);
}

// ── #8: AI Macro Calculator ──
async function calculatePersonalizedMacros(userProfile) {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `Calculate personalized daily macro targets. Return JSON:
{
  "calories": 2000,
  "protein": 150,
  "carbs": 200,
  "fat": 67,
  "fiber": 30,
  "reasoning": "Brief explanation"
}`
    },
    {
      role: 'user',
      content: `Calculate daily macro targets for: ${JSON.stringify(userProfile)}
Consider their age, weight, height, activity level, and goals. Use evidence-based formulas (Mifflin-St Jeor for BMR, activity multiplier for TDEE).`
    }
  ], { jsonMode: true, temperature: 0.2 });

  return JSON.parse(response);
}

module.exports = {
  isConfigured,
  chatCompletion,
  generateImage,
  optimizeMealPlan,
  mealPlanChat,
  getSubstitutions,
  whatCanIMake,
  estimateBudget,
  nutritionInsights,
  generateRecipeImage,
  generateRecipe,
  generateSearchTerms,
  calculateMealDistribution,
  interpretDietaryInput,
  calculatePersonalizedMacros,
};
