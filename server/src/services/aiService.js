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

  // Get ALL meal plans from current week onward (current + all future weeks)
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;

  // Fetch all plans from this week onward
  const allPlans = db.prepare('SELECT id, week_start_date FROM meal_plans WHERE user_id = ? AND week_start_date >= ? ORDER BY week_start_date').all(userId, weekStart);
  
  let mealPlanSummary = 'No meal plan generated yet.';
  let planItems = []; // all items from all weeks for action detection
  const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const fmtDate = (d) => `${d.getMonth()+1}/${d.getDate()}`;
  
  // Format a week's items into summary text
  const formatWeekItems = (items) => items.map(i => {
    const n = parseJSON(i.nutrition, {});
    return `${dayNames[i.day_of_week]} ${i.meal_type}: ${i.recipe_name} (${n.calories || '?'} cal, itemId:${i.item_id})`;
  }).join('\n');

  const weekSummaries = [];
  let currentWeekPlan = null;
  
  for (const p of allPlans) {
    const weekItems = db.prepare(`SELECT mpi.id as item_id, mpi.day_of_week, mpi.meal_type, mpi.scale_factor, r.id as recipe_id, r.name as recipe_name, r.nutrition
      FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ?`).all(p.id);
    
    if (weekItems.length === 0) continue;
    
    // Track the first plan as current week
    if (!currentWeekPlan && p.week_start_date === weekStart) currentWeekPlan = p;
    
    planItems = [...planItems, ...weekItems];
    
    // Calculate week label
    const ws = new Date(p.week_start_date + 'T00:00:00');
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    
    let label;
    if (p.week_start_date === weekStart) {
      label = `THIS WEEK (${fmtDate(ws)} - ${fmtDate(we)})`;
    } else {
      // Calculate how many weeks ahead
      const diffMs = ws.getTime() - monday.getTime();
      const weeksAhead = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
      if (weeksAhead === 1) {
        label = `NEXT WEEK (${fmtDate(ws)} - ${fmtDate(we)})`;
      } else {
        label = `WEEK OF ${fmtDate(ws)} - ${fmtDate(we)} (${weeksAhead} weeks ahead)`;
      }
    }
    
    weekSummaries.push(`${label}:\n${formatWeekItems(weekItems)}`);
  }
  
  if (weekSummaries.length > 0) {
    mealPlanSummary = weekSummaries.join('\n\n');
  }
  
  const plan = currentWeekPlan || (allPlans.length > 0 ? allPlans[0] : null);

  // Get available recipes from DB so AI can suggest REAL recipes that exist
  const availableRecipes = {};
  for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack']) {
    const recipes = db.prepare('SELECT name FROM recipes WHERE meal_type = ? ORDER BY name LIMIT 30').all(mealType);
    availableRecipes[mealType] = recipes.map(r => r.name);
  }

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
- CRITICAL: NEVER suggest or recommend any recipe that contains a disliked ingredient. When swapping meals, always pick alternatives that avoid ALL disliked ingredients.

Meal plans:
${mealPlanSummary}

IMPORTANT: The meal plans above show ALL generated weeks (this week and any future weeks). Match the user's request to the correct week and use the itemIds from that week's section. If the user says "next week", use NEXT WEEK's itemIds. If they reference a specific date or "2 weeks from now", find the matching week section.

IMPORTANT: You MUST always respond with valid JSON in this exact format:
{
  "response": "Your friendly text response here",
  "proposedActions": []
}

When the user's message implies they want to CHANGE something, include proposed actions. Action types:
- "swap_meal": User wants to change a specific meal. Include { "type": "swap_meal", "label": "Replace [Day] [meal] with [new recipe]", "data": { "itemId": <itemId from plan above>, "newRecipeName": "exact recipe name from available recipes below" } }
- "regenerate_week": User wants a whole new week plan. Include { "type": "regenerate_week", "label": "Regenerate entire meal plan" }
- "add_dislike": User expresses dislike for a food/ingredient. Include { "type": "add_dislike", "label": "Add [ingredient] to disliked ingredients", "data": { "ingredient": "ingredient name" } }
- "add_like": User expresses love for a food/ingredient. Include { "type": "add_like", "label": "Add [ingredient] to loved ingredients", "data": { "ingredient": "ingredient name" } }
- "update_restriction": User mentions a dietary restriction. Include { "type": "update_restriction", "label": "Add [restriction] to your dietary restrictions", "data": { "restriction": "restriction name" } }
- "update_macros": User wants to change macro targets. Include { "type": "update_macros", "label": "Update [macro] target to [value]", "data": { "field": "calories|protein|carbs|fat", "value": number } }

Rules:
- Only propose actions when the user clearly implies a change. Normal questions get an empty proposedActions array.
- You can propose multiple actions at once (e.g., dislike + swap meals containing that ingredient).
- Keep response text under 300 words. Be friendly and use emojis sparingly.
- ALWAYS return valid JSON. No markdown, no code fences.
- CRITICAL for swap_meal: You MUST ONLY suggest recipe names from the AVAILABLE RECIPES list below. Do NOT invent recipe names. The newRecipeName must exactly match one of these names.
- When describing a swap in your response text, mention the EXACT recipe name you put in newRecipeName so the user sees consistent information.

AVAILABLE RECIPES IN DATABASE (use ONLY these names for swap_meal newRecipeName):
Breakfast: ${availableRecipes.breakfast?.join(', ') || 'None'}
Lunch: ${availableRecipes.lunch?.join(', ') || 'None'}
Dinner: ${availableRecipes.dinner?.join(', ') || 'None'}
Snack: ${availableRecipes.snack?.join(', ') || 'None'}`
    },
    ...conversationHistory.slice(-10),
    { role: 'user', content: userMessage }
  ];

  const response = await chatCompletion(messages, { temperature: 0.7, maxTokens: 1500, jsonMode: true });
  
  // Robust JSON extraction — handle markdown fences, partial JSON, etc.
  let parsed = null;
  try {
    parsed = JSON.parse(response);
  } catch {
    // Try extracting JSON from markdown code fences
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[1].trim()); } catch {}
    }
    // Try finding JSON object in the response
    if (!parsed) {
      const braceMatch = response.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try { parsed = JSON.parse(braceMatch[0]); } catch {}
      }
    }
  }

  const textResponse = parsed?.response || response;
  let actions = parsed?.proposedActions || [];

  // Server-side action detection fallback:
  // If the AI described actions in text but forgot to include them in proposedActions,
  // auto-detect and generate them from the text + user message
  if (actions.length === 0) {
    actions = detectActionsFromText(userMessage, textResponse, planItems, context);
  }

  console.log(`🤖 AI chat: ${actions.length} proposed actions (parsed: ${parsed?.proposedActions?.length || 0}, detected: ${actions.length - (parsed?.proposedActions?.length || 0)})`);
  console.log(`🤖 AI raw response (first 200 chars): ${response.slice(0, 200)}`);
  
  return { response: textResponse, proposedActions: actions, planId: plan?.id || null };
}

/**
 * Server-side fallback: detect actionable intent from user message + AI response text
 * and generate proposedActions that the AI forgot to include
 */
function detectActionsFromText(userMessage, aiResponse, planItems, context) {
  const actions = [];
  const msg = userMessage.toLowerCase();
  const resp = (aiResponse || '').toLowerCase();

  // Detect dislike patterns
  const dislikePatterns = [
    /i (?:don'?t|do not) like (\w[\w\s]*?)(?:\.|,|!|$)/i,
    /i hate (\w[\w\s]*?)(?:\.|,|!|$)/i,
    /i'?m not a fan of (\w[\w\s]*?)(?:\.|,|!|$)/i,
    /(?:remove|no more|no) (\w[\w\s]*?) (?:please|from|in)/i,
    /allergic to (\w[\w\s]*?)(?:\.|,|!|$)/i,
  ];
  for (const pattern of dislikePatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      const ingredient = match[1].trim().replace(/\s+/g, ' ');
      if (ingredient.length > 1 && ingredient.length < 30) {
        actions.push({
          type: 'add_dislike',
          label: `Add "${ingredient}" to disliked ingredients`,
          data: { ingredient }
        });
        // Also propose swapping meals that contain this ingredient
        if (planItems.length > 0) {
          const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
          for (const item of planItems) {
            if (item.recipe_name?.toLowerCase().includes(ingredient.toLowerCase())) {
              actions.push({
                type: 'swap_meal',
                label: `Replace ${dayNames[item.day_of_week]} ${item.meal_type} (${item.recipe_name})`,
                data: { itemId: item.item_id, newRecipeName: null }
              });
            }
          }
        }
      }
    }
  }

  // Detect like patterns
  const likePatterns = [
    /i (?:love|really like|enjoy) (\w[\w\s]*?)(?:\.|,|!|$)/i,
    /i'?m a (?:big )?fan of (\w[\w\s]*?)(?:\.|,|!|$)/i,
    /more (\w[\w\s]*?) (?:please|in my|meals)/i,
  ];
  for (const pattern of likePatterns) {
    const match = userMessage.match(pattern);
    if (match && !msg.includes("don't") && !msg.includes('not')) {
      const ingredient = match[1].trim().replace(/\s+/g, ' ');
      if (ingredient.length > 1 && ingredient.length < 30) {
        actions.push({
          type: 'add_like',
          label: `Add "${ingredient}" to loved ingredients`,
          data: { ingredient }
        });
      }
    }
  }

  // Detect restriction patterns
  const restrictionPatterns = [
    /i'?m (?:going )?(vegan|vegetarian|pescatarian|gluten[- ]free|dairy[- ]free|keto|paleo)/i,
    /i (?:need|want) (?:to be |to go )?(vegan|vegetarian|pescatarian|gluten[- ]free|dairy[- ]free|keto|paleo)/i,
    /(?:switch|change) (?:to |me to )?(vegan|vegetarian|pescatarian|gluten[- ]free|dairy[- ]free|keto|paleo)/i,
  ];
  for (const pattern of restrictionPatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      const restriction = match[1].trim();
      actions.push({
        type: 'update_restriction',
        label: `Add "${restriction}" to dietary restrictions`,
        data: { restriction }
      });
    }
  }

  // Detect meal swap patterns
  const dayNames = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const mealTypes = ['breakfast','lunch','dinner','snack'];
  const swapPatterns = [
    /(?:change|swap|replace|switch) (\w+) (\w+)/i,
    /(?:change|swap|replace|switch) (?:my |the )?(\w+) (\w+)/i,
  ];
  for (const pattern of swapPatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      const word1 = match[1].toLowerCase();
      const word2 = match[2].toLowerCase();
      let dayIdx = dayNames.indexOf(word1);
      let mealType = mealTypes.includes(word2) ? word2 : null;
      if (dayIdx === -1) { dayIdx = dayNames.indexOf(word2); mealType = mealTypes.includes(word1) ? word1 : null; }
      
      if (dayIdx >= 0 && planItems.length > 0) {
        const item = planItems.find(i => i.day_of_week === dayIdx && (!mealType || i.meal_type === mealType));
        if (item) {
          const dn = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
          // Only add if not already in actions
          if (!actions.some(a => a.type === 'swap_meal' && a.data?.itemId === item.item_id)) {
            actions.push({
              type: 'swap_meal',
              label: `Replace ${dn[item.day_of_week]} ${item.meal_type} (${item.recipe_name})`,
              data: { itemId: item.item_id, newRecipeName: null }
            });
          }
        }
      }
    }
  }

  // Detect macro update patterns
  const macroPatterns = [
    /(?:set|change|update|increase|decrease) (?:my )?(?:daily )?(?:calorie|calories|cal) (?:to |target to |goal to )?(\d+)/i,
    /(?:set|change|update|increase|decrease) (?:my )?protein (?:to |target to |goal to )?(\d+)/i,
    /(\d+)\s*(?:g|grams?)?\s*(?:of\s+)?protein/i,
    /(\d+)\s*(?:cal|calories|kcal)/i,
  ];
  const calMatch = userMessage.match(/(?:set|change|update|increase|decrease) (?:my )?(?:daily )?(?:calorie|calories|cal)\w* (?:to |target to |goal to )?(\d+)/i);
  if (calMatch) {
    actions.push({ type: 'update_macros', label: `Update calorie target to ${calMatch[1]}`, data: { field: 'calories', value: parseInt(calMatch[1]) } });
  }
  const protMatch = userMessage.match(/(?:set|change|update|increase|decrease) (?:my )?protein\w* (?:to |target to |goal to )?(\d+)/i);
  if (protMatch) {
    actions.push({ type: 'update_macros', label: `Update protein target to ${protMatch[1]}g`, data: { field: 'protein', value: parseInt(protMatch[1]) } });
  }

  // Detect regenerate patterns
  if (/(?:regenerate|redo|new|fresh|start over|remake) (?:my |the |this )?(?:whole |entire )?(?:week|meal plan|plan)/i.test(userMessage)) {
    actions.push({ type: 'regenerate_week', label: 'Regenerate entire meal plan', data: {} });
  }

  return actions;
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

// ── Feature: Analyze Food Photo (Vision) ──
async function analyzePhoto(base64Image) {
  if (!isConfigured()) throw new Error('AI not configured. Set OPENAI_API_KEY in environment.');

  const messages = [
    {
      role: 'system',
      content: `You are a nutrition expert analyzing food photos. Identify the food and estimate its nutrition. Return JSON:
{
  "food": {
    "name": "descriptive name of the food",
    "calories": 450,
    "protein": 25,
    "carbs": 40,
    "fat": 18,
    "fiber": 5
  },
  "confidence": "high|medium|low",
  "details": "Brief description of what you see"
}
If you cannot identify food in the image, return: {"food": null, "confidence": "low", "details": "reason"}`
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What food is in this photo? Estimate the nutrition per serving.' },
        { type: 'image_url', image_url: { url: base64Image } }
      ]
    }
  ];

  const res = await fetch(`${OPENAI_BASE_URL()}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY()}` },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) { const err = await res.text(); throw new Error(`Vision request failed (${res.status}): ${err}`); }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ── Feature: Natural Language Food Parsing ──
async function parseFoodDescription(description) {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a nutrition expert. Parse a natural language food description into structured nutrition data. Be accurate — use USDA-level estimates.

Return JSON:
{
  "description": "cleaned up description",
  "calories": 450,
  "protein": 25,
  "carbs": 40,
  "fat": 18,
  "fiber": 5,
  "items": [
    {"name": "grilled chicken breast", "calories": 280, "protein": 42, "carbs": 0, "fat": 12, "fiber": 0},
    {"name": "white rice (1 cup)", "calories": 170, "protein": 3, "carbs": 40, "fat": 0, "fiber": 1}
  ],
  "confidence": "high|medium|low"
}`
    },
    {
      role: 'user',
      content: `Parse this food description and estimate nutrition: "${description}"`
    }
  ], { jsonMode: true, temperature: 0.2, maxTokens: 500 });

  return JSON.parse(response);
}

// ── Feature: Explain Meal Plan ──
async function explainMealPlan(userId, planId) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  const items = db.prepare(`
    SELECT mpi.day_of_week, mpi.meal_type, r.name, r.cuisine, r.nutrition, r.prep_time_minutes, r.cook_time_minutes
    FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mpi.meal_plan_id = ?
    ORDER BY mpi.day_of_week, mpi.meal_type
  `).all(planId);

  const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(userId);
  const cuisines = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(userId);
  const diets = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(userId);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const planSummary = items.map(i => `${days[i.day_of_week]} ${i.meal_type}: ${i.name} (${i.cuisine || 'mixed'})`).join('\n');

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a friendly meal planning assistant. Write a warm, personalized 3-4 sentence summary explaining why this week's meal plan is great for the user. Mention cuisine variety, nutrition highlights, and any practical benefits (quick meals, batch-friendly, etc.). Use a conversational tone with 1-2 emojis. Return JSON:
{
  "summary": "Your personalized summary here",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"],
  "weekTheme": "A fun 2-3 word theme for the week"
}`
    },
    {
      role: 'user',
      content: `User's macro targets: ${macros ? `${macros.calories} cal, ${macros.protein_g}g protein` : '2000 cal, 150g protein'}
Favorite cuisines: ${cuisines ? parseJSON(cuisines.favorite_cuisines, []).join(', ') : 'varied'}
Dietary restrictions: ${diets ? parseJSON(diets.restrictions, []).join(', ') : 'none'}

This week's plan:
${planSummary}`
    }
  ], { jsonMode: true, temperature: 0.7, maxTokens: 400 });

  return JSON.parse(response);
}

// ── Feature: Smart Grocery Optimization ──
async function optimizeGroceryList(items, userContext) {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a smart grocery shopping assistant. Optimize a grocery list by merging similar items, flagging pantry staples most people already have, and suggesting budget-friendly swaps. Return JSON:
{
  "mergedItems": [
    {"name": "tomatoes", "originalItems": ["diced tomatoes", "cherry tomatoes"], "quantity": "2 cans + 1 pint", "category": "Produce", "note": "merged similar items"}
  ],
  "pantryStaples": ["salt", "black pepper", "olive oil"],
  "budgetTips": [
    {"original": "pine nuts", "swap": "sunflower seeds", "savings": "~$4", "note": "Similar crunch, fraction of the cost"}
  ],
  "seasonalPicks": ["butternut squash", "apples"],
  "estimatedTotal": "$75-90"
}`
    },
    {
      role: 'user',
      content: `Optimize this grocery list for ${userContext.store || 'a typical grocery store'}.
Budget preference: ${userContext.budget || 'moderate'}
Organic preference: ${userContext.organic || 'no preference'}

Items:
${items.map(i => typeof i === 'string' ? `- ${i}` : `- ${i.name}: ${i.quantity || ''} ${i.unit || ''} (${i.category || 'Other'})`).join('\n')}`
    }
  ], { jsonMode: true, temperature: 0.3, maxTokens: 1000 });

  return JSON.parse(response);
}

// ── Feature: Pantry Expiry Alerts ──
async function pantryExpiryAlerts(pantryItems, userId) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  // Get some recipes for context
  const recipes = db.prepare('SELECT name, ingredients, meal_type FROM recipes LIMIT 50').all();
  const expiringNames = pantryItems.map(p => p.name).join(', ');

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a helpful kitchen assistant. The user has pantry items expiring soon. Suggest creative ways to use them up before they go bad. Be practical and encouraging. Return JSON:
{
  "alerts": [
    {
      "item": "avocados",
      "daysLeft": 2,
      "urgency": "high",
      "emoji": "🥑",
      "suggestion": "Make guacamole tonight — it's a crowd-pleaser and uses all 3 avocados",
      "quickRecipe": "Mash avocados with lime, salt, cilantro, and diced onion"
    }
  ],
  "mealIdea": "A creative meal that uses multiple expiring items together",
  "tip": "A general food waste reduction tip"
}`
    },
    {
      role: 'user',
      content: `These pantry items are expiring soon:
${pantryItems.map(p => `- ${p.name}: ${p.quantity} ${p.unit}, expires ${p.expiry_date} (${p.daysLeft} days left)`).join('\n')}

Suggest how to use them up!`
    }
  ], { jsonMode: true, temperature: 0.7, maxTokens: 800 });

  return JSON.parse(response);
}

// ── Feature: Recipe Cooking Tips & Enhancements ──
async function getRecipeEnhancements(recipe, enhancementType) {
  // Format ingredients/instructions for the prompt (handle both arrays and strings)
  const fmtIngredients = (r) => {
    if (Array.isArray(r.ingredients)) return r.ingredients.map(i => typeof i === 'string' ? i : i.name).join(', ');
    if (typeof r.ingredients === 'string') return r.ingredients;
    return 'Not available';
  };
  const fmtInstructions = (r) => {
    if (Array.isArray(r.instructions)) return r.instructions.join('. ');
    if (typeof r.instructions === 'string') return r.instructions;
    return 'Not available';
  };
  const fmtNutrition = (r) => {
    if (typeof r.nutrition === 'object' && r.nutrition) return JSON.stringify(r.nutrition);
    if (typeof r.nutrition === 'string') return r.nutrition;
    return 'Not available';
  };

  const prompts = {
    'cooking-tips': {
      system: `You are a friendly home cooking coach. Give 3-4 practical cooking tips for this recipe that will make it taste restaurant-quality. Return JSON:
{
  "tips": [
    {"icon": "🔥", "title": "Sear first", "detail": "Get the pan smoking hot before adding the protein for a perfect crust"},
    {"icon": "🧂", "title": "Season in layers", "detail": "Add salt at each step, not just at the end"}
  ],
  "proTip": "One advanced technique that elevates the dish"
}`,
      user: (r) => `Give cooking tips for: ${r.name}\nIngredients: ${fmtIngredients(r)}\nInstructions: ${fmtInstructions(r)}`
    },
    'make-healthier': {
      system: `You are a nutrition-focused chef. Suggest modifications to make this recipe healthier without sacrificing flavor. Return JSON:
{
  "modifications": [
    {"original": "heavy cream", "swap": "cashew cream or light coconut milk", "impact": "Saves ~120 cal, removes dairy", "tasteImpact": "minimal"}
  ],
  "nutritionSavings": {"calories": -150, "fat": -12, "protein": 0},
  "summary": "Brief summary of the healthier version"
}`,
      user: (r) => `Make this recipe healthier: ${r.name}\nIngredients: ${fmtIngredients(r)}\nNutrition: ${fmtNutrition(r)}`
    },
    'pairings': {
      system: `You are a food and beverage pairing expert. Suggest what goes well with this dish. Return JSON:
{
  "sides": [{"name": "Roasted asparagus", "why": "The earthy flavor complements the richness"}],
  "beverages": [{"name": "Sauvignon Blanc", "why": "Crisp acidity cuts through the richness"}, {"name": "Sparkling water with lemon", "why": "Refreshing non-alcoholic option"}],
  "dessert": {"name": "Lemon sorbet", "why": "Light and palate-cleansing"}
}`,
      user: (r) => `Suggest pairings for: ${r.name} (${r.cuisine || 'mixed'} cuisine)\nKey ingredients: ${fmtIngredients(r)}`
    }
  };

  const prompt = prompts[enhancementType];
  if (!prompt) throw new Error('Unknown enhancement type');

  const response = await chatCompletion([
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user(recipe) }
  ], { jsonMode: true, temperature: 0.6, maxTokens: 600 });

  return JSON.parse(response);
}

// ── Feature: Meal Prep Guide ──
async function generateMealPrepGuide(userId, planId) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  const items = db.prepare(`
    SELECT mpi.day_of_week, mpi.meal_type, mpi.servings, r.name, r.ingredients, r.prep_time_minutes, r.cook_time_minutes, r.instructions
    FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mpi.meal_plan_id = ?
    ORDER BY mpi.day_of_week
  `).all(planId);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const planSummary = items.map(i => ({
    day: days[i.day_of_week], meal: i.meal_type, name: i.name,
    prepTime: i.prep_time_minutes, cookTime: i.cook_time_minutes,
    ingredients: parseJSON(i.ingredients, []).map(ing => ing.name).join(', ')
  }));

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a meal prep expert. Create a practical Sunday meal prep guide for the week's meals. Focus on what can be prepped ahead, batch-cooked, or stored. Be specific with times. Return JSON:
{
  "totalPrepTime": "2 hours 15 minutes",
  "steps": [
    {"order": 1, "time": "15 min", "icon": "🔪", "task": "Chop all vegetables for the week", "detail": "Dice onions, mince garlic, chop bell peppers. Store in separate containers.", "forMeals": ["Monday dinner", "Wednesday lunch"]},
    {"order": 2, "time": "30 min", "icon": "🍚", "task": "Cook grains in bulk", "detail": "Make 4 cups rice and 2 cups quinoa. Portion into containers.", "forMeals": ["Tuesday lunch", "Thursday dinner"]}
  ],
  "storageNotes": ["Cooked rice keeps 4 days in the fridge", "Pre-cut veggies last 3-4 days"],
  "morningOf": [
    {"day": "Wednesday", "task": "Thaw salmon in fridge the night before", "time": "1 min"}
  ],
  "tip": "A motivational meal prep tip"
}`
    },
    {
      role: 'user',
      content: `Create a meal prep guide for this week:\n${JSON.stringify(planSummary, null, 2)}`
    }
  ], { jsonMode: true, temperature: 0.5, maxTokens: 1500 });

  return JSON.parse(response);
}

// ── Feature: Multi-Week Trend Analysis ──
async function analyzeTrends(weeklyData, targets) {
  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a nutrition coach analyzing multi-week trends. Identify patterns, improvements, and areas of concern. Be encouraging but honest. Return JSON:
{
  "overallTrend": "improving|stable|declining",
  "trendEmoji": "📈",
  "summary": "2-3 sentence trend summary",
  "patterns": [
    {"icon": "📊", "pattern": "Your protein intake has improved 15% over 3 weeks", "type": "positive"},
    {"icon": "⚠️", "pattern": "Weekend calorie intake is consistently 30% higher", "type": "warning"}
  ],
  "predictions": [
    {"icon": "🎯", "prediction": "At this rate, you'll consistently hit protein targets within 2 weeks"}
  ],
  "correlations": [
    {"insight": "Weeks where you meal-prepped on Sunday, you hit targets 5/7 days vs 3/7"}
  ],
  "weeklyGrades": [{"week": "Mar 3", "grade": "B+"}, {"week": "Mar 10", "grade": "A-"}],
  "encouragement": "Motivational closing message"
}`
    },
    {
      role: 'user',
      content: `Analyze these weekly nutrition trends against daily targets: ${JSON.stringify(targets)}

Weekly data (most recent first):
${JSON.stringify(weeklyData, null, 2)}`
    }
  ], { jsonMode: true, temperature: 0.5, maxTokens: 800 });

  return JSON.parse(response);
}

// Feature 9: Analyze family taste preferences from feedback data
async function analyzeFamilyTastes(familyFeedback) {
  if (!isConfigured()) return { summary: 'AI not configured', memberProfiles: [] };

  const messages = [
    {
      role: 'system',
      content: `You are a family meal planning AI. Analyze meal feedback from family members to identify taste patterns and preferences. Return JSON with:
{
  "summary": "Brief overview of family eating patterns",
  "memberProfiles": [
    {
      "name": "Member name",
      "userId": "id",
      "lovedCuisines": ["Italian", "Mexican"],
      "dislikedFoods": ["fish", "mushrooms"],
      "patterns": "Prefers quick meals, loves spicy food",
      "satisfactionScore": 85
    }
  ],
  "familyFavorites": ["Recipe names everyone loved"],
  "avoidForFamily": ["Recipe names someone disliked"],
  "suggestions": ["Actionable suggestions for next week's plan"],
  "conflictResolution": "How to handle differing tastes (e.g., make fish on nights when the fish-hater has plans)"
}`
    },
    {
      role: 'user',
      content: `Family meal feedback data:\n${JSON.stringify(familyFeedback, null, 2)}`
    }
  ];

  const result = await chatCompletion(messages, { response_format: { type: 'json_object' } });
  try { return JSON.parse(result); } catch { return { summary: result, memberProfiles: [] }; }
}

// Feature 10: Enhanced insights with actionable swap suggestions
async function getActionableSwaps(weekData, targets) {
  if (!isConfigured()) return { swaps: [], quickFixes: [] };

  const messages = [
    {
      role: 'system',
      content: `You are a nutrition coach AI. Given a user's weekly meal data and their macro targets, suggest specific actionable swaps they can make to improve their nutrition. Return JSON:
{
  "swaps": [
    {
      "currentMeal": "What they're eating",
      "day": "Monday lunch",
      "issue": "Too high in carbs, low protein",
      "suggestedSwap": "Specific replacement meal",
      "impact": "+15g protein, -20g carbs",
      "difficulty": "easy"
    }
  ],
  "quickFixes": [
    {
      "action": "Add a protein shake after workouts",
      "impact": "+25g protein daily",
      "icon": "💪"
    }
  ],
  "weekOverWeek": {
    "trend": "improving" | "declining" | "stable",
    "caloriesTrend": "+50 cal/day vs last week",
    "proteinTrend": "-5g/day vs last week",
    "summary": "You're eating 200 more calories this week, mostly from snacks"
  },
  "topPriority": "The single most impactful change they could make"
}`
    },
    {
      role: 'user',
      content: `Weekly data:\n${JSON.stringify(weekData, null, 2)}\n\nTargets:\n${JSON.stringify(targets, null, 2)}`
    }
  ];

  const result = await chatCompletion(messages, { response_format: { type: 'json_object' } });
  try { return JSON.parse(result); } catch { return { swaps: [], quickFixes: [], topPriority: result }; }
}

// ── Feature: Parse Recipe from URL (scraped content) ──
async function parseRecipeFromUrl(scrapedData) {
  if (!isConfigured()) throw new Error('AI not configured. Set OPENAI_API_KEY in environment.');

  // If we have structured JSON-LD recipe data, use it directly with minimal AI help
  let contextText = '';
  if (scrapedData.hasStructuredData && scrapedData.jsonLdRecipe) {
    const jld = scrapedData.jsonLdRecipe;
    contextText = `STRUCTURED RECIPE DATA (from JSON-LD):\n` +
      `Name: ${jld.name}\n` +
      `Description: ${jld.description}\n` +
      `Cuisine: ${jld.cuisine}\n` +
      `Category: ${jld.category}\n` +
      `Servings: ${jld.servings}\n` +
      `Prep Time: ${jld.prepTime}\n` +
      `Cook Time: ${jld.cookTime}\n` +
      `Ingredients: ${JSON.stringify(jld.ingredients)}\n` +
      `Instructions: ${JSON.stringify(jld.instructions)}\n` +
      `Keywords: ${jld.keywords}\n`;
  } else {
    // Build context from meta tags + body text
    contextText = `URL: ${scrapedData.url}\n` +
      `Platform: ${scrapedData.platform}\n` +
      `Page Title: ${scrapedData.pageTitle || scrapedData.ogTitle}\n` +
      `Description: ${scrapedData.ogDescription || scrapedData.metaDescription}\n` +
      `Site: ${scrapedData.ogSiteName}\n` +
      `\nPAGE CONTENT:\n${scrapedData.bodyText}`;
  }

  const response = await chatCompletion([
    {
      role: 'system',
      content: `You are a recipe extraction expert. Given web page content (which may be from Instagram, TikTok, YouTube, a food blog, or any website), extract a complete, structured recipe.

Return JSON with this exact structure:
{
  "name": "Recipe name",
  "description": "Brief description of the dish",
  "cuisine": "Cuisine type (Italian, Mexican, Indian, etc.) or empty string if unknown",
  "mealType": "breakfast|lunch|dinner|snack",
  "ingredients": [{"name": "ingredient name", "quantity": "amount", "unit": "unit"}],
  "instructions": ["Step 1 text", "Step 2 text", ...],
  "prepTimeMinutes": number or null,
  "cookTimeMinutes": number or null,
  "servings": number (default 4),
  "tags": ["tag1", "tag2"]
}

Rules:
- Always return valid JSON
- If the content is a social media post caption (Instagram/TikTok), infer the recipe from the description. If ingredients/instructions are vague, make reasonable assumptions based on the dish name.
- For YouTube videos, extract from the title and description
- Parse ingredient quantities into separate name/quantity/unit fields (e.g., "2 cups flour" → {name: "flour", quantity: "2", unit: "cups"})
- If prep/cook times are in ISO 8601 format (PT30M), convert to minutes
- Classify mealType based on the dish (eggs/pancakes → breakfast, salad/sandwich → lunch, main courses → dinner, etc.)
- Include relevant tags like "quick", "vegetarian", "gluten-free", cuisine type, etc.
- If you cannot determine a recipe from the content, return {"error": "Could not extract a recipe from this URL. The page may not contain recipe content."}`
    },
    {
      role: 'user',
      content: contextText
    }
  ], { jsonMode: true, temperature: 0.3, maxTokens: 2000 });

  try {
    const parsed = JSON.parse(response);
    if (parsed.error) throw new Error(parsed.error);
    
    // Add source URL
    parsed.sourceUrl = scrapedData.url;
    parsed.sourceImage = scrapedData.ogImage || scrapedData.jsonLdRecipe?.image || '';
    
    return parsed;
  } catch (err) {
    if (err.message.includes('Could not extract')) throw err;
    throw new Error('Failed to parse AI response into a recipe. Please try a different URL.');
  }
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
  analyzePhoto,
  parseFoodDescription,
  explainMealPlan,
  optimizeGroceryList,
  pantryExpiryAlerts,
  getRecipeEnhancements,
  generateMealPrepGuide,
  analyzeTrends,
  analyzeFamilyTastes,
  getActionableSwaps,
  parseRecipeFromUrl,
};
