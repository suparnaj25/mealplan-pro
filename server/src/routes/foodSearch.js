const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Common meals with pre-computed nutrition (instant, no API needed)
const COMMON_MEALS = [
  { name: 'Chicken Breast (grilled, 6oz)', calories: 280, protein: 53, carbs: 0, fat: 6 },
  { name: 'Salmon Fillet (baked, 6oz)', calories: 350, protein: 38, carbs: 0, fat: 20 },
  { name: 'Brown Rice (1 cup cooked)', calories: 215, protein: 5, carbs: 45, fat: 2 },
  { name: 'White Rice (1 cup cooked)', calories: 205, protein: 4, carbs: 45, fat: 0 },
  { name: 'Quinoa (1 cup cooked)', calories: 222, protein: 8, carbs: 39, fat: 4 },
  { name: 'Pasta (1 cup cooked)', calories: 220, protein: 8, carbs: 43, fat: 1 },
  { name: 'Scrambled Eggs (2 eggs)', calories: 180, protein: 12, carbs: 2, fat: 14 },
  { name: 'Oatmeal (1 cup cooked)', calories: 160, protein: 6, carbs: 27, fat: 3 },
  { name: 'Greek Yogurt (1 cup)', calories: 130, protein: 22, carbs: 9, fat: 0 },
  { name: 'Avocado (1 whole)', calories: 240, protein: 3, carbs: 13, fat: 22 },
  { name: 'Banana (1 medium)', calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: 'Apple (1 medium)', calories: 95, protein: 0, carbs: 25, fat: 0 },
  { name: 'Chicken Caesar Salad', calories: 440, protein: 38, carbs: 18, fat: 24 },
  { name: 'Turkey Sandwich', calories: 350, protein: 25, carbs: 35, fat: 12 },
  { name: 'Veggie Burger', calories: 380, protein: 15, carbs: 45, fat: 16 },
  { name: 'Protein Shake', calories: 200, protein: 30, carbs: 10, fat: 5 },
  { name: 'Almonds (1 oz / 23 nuts)', calories: 164, protein: 6, carbs: 6, fat: 14 },
  { name: 'Peanut Butter (2 tbsp)', calories: 190, protein: 7, carbs: 7, fat: 16 },
  { name: 'Hummus (1/3 cup)', calories: 140, protein: 5, carbs: 12, fat: 8 },
  { name: 'Sweet Potato (1 medium)', calories: 103, protein: 2, carbs: 24, fat: 0 },
  { name: 'Broccoli (1 cup steamed)', calories: 55, protein: 4, carbs: 11, fat: 1 },
  { name: 'Spinach Salad (2 cups)', calories: 40, protein: 3, carbs: 4, fat: 1 },
  { name: 'Tofu (firm, 1/2 block)', calories: 180, protein: 20, carbs: 4, fat: 10 },
  { name: 'Black Beans (1 cup)', calories: 230, protein: 15, carbs: 40, fat: 1 },
  { name: 'Lentil Soup (1 bowl)', calories: 280, protein: 18, carbs: 42, fat: 6 },
  { name: 'Smoothie Bowl', calories: 340, protein: 8, carbs: 50, fat: 14 },
  { name: 'Toast with Avocado', calories: 300, protein: 7, carbs: 30, fat: 18 },
  { name: 'Burrito Bowl', calories: 520, protein: 28, carbs: 55, fat: 20 },
  { name: 'Stir Fry (chicken + veggies)', calories: 380, protein: 30, carbs: 25, fat: 15 },
  { name: 'Pizza (2 slices)', calories: 570, protein: 22, carbs: 60, fat: 26 },
  { name: 'Sushi Roll (8 pieces)', calories: 350, protein: 15, carbs: 50, fat: 8 },
  { name: 'Pad Thai', calories: 450, protein: 20, carbs: 55, fat: 18 },
  { name: 'Tacos (2)', calories: 400, protein: 20, carbs: 36, fat: 18 },
  { name: 'Soup and Bread', calories: 320, protein: 12, carbs: 45, fat: 10 },
  { name: 'Grilled Cheese Sandwich', calories: 400, protein: 15, carbs: 35, fat: 22 },
  { name: 'Coffee with Milk', calories: 60, protein: 3, carbs: 6, fat: 3 },
  { name: 'Protein Bar', calories: 220, protein: 20, carbs: 25, fat: 8 },
  { name: 'Trail Mix (1/4 cup)', calories: 175, protein: 5, carbs: 16, fat: 11 },
];

// GET /api/food/search?q=chicken breast — fast, hybrid search
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ foods: [] });

    const query = q.toLowerCase();
    const foods = [];

    // 1. Search common meals first (instant, very accurate for typical meals)
    const commonMatches = COMMON_MEALS.filter(m => m.name.toLowerCase().includes(query)).slice(0, 4);
    foods.push(...commonMatches.map(m => ({ ...m, brand: '', servingSize: '1 serving', image: null, source: 'common' })));

    // 2. Search user's own recipe database
    const db = require('../db/connection');
    const recipeMatches = db.prepare('SELECT name, nutrition FROM recipes WHERE name LIKE ? LIMIT 4').all(`%${q}%`);
    for (const r of recipeMatches) {
      try {
        const n = JSON.parse(r.nutrition || '{}');
        foods.push({ name: r.name, brand: 'My Recipes', servingSize: '1 serving', image: null, calories: n.calories || 0, protein: n.protein || 0, carbs: n.carbs || 0, fat: n.fat || 0, source: 'recipe' });
      } catch {}
    }

    // 3. AI nutrition estimation for the exact query (if AI configured)
    if (foods.length < 4 && process.env.OPENAI_API_KEY) {
      try {
        const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const aiRes = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model, temperature: 0.2, max_tokens: 200,
            messages: [
              { role: 'system', content: 'You are a nutrition database. Given a food description, return ONLY a JSON object: { "name": "food name with portion", "calories": number, "protein": number, "carbs": number, "fat": number }. Be accurate. No explanation.' },
              { role: 'user', content: `Nutrition for: ${q}` }
            ]
          }),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = (aiData.choices?.[0]?.message?.content || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            const f = JSON.parse(match[0]);
            foods.unshift({ name: f.name || q, brand: '✨ AI Estimate', servingSize: '1 serving', image: null, calories: Math.round(f.calories || 0), protein: Math.round(f.protein || 0), carbs: Math.round(f.carbs || 0), fat: Math.round(f.fat || 0), source: 'ai' });
          }
        }
      } catch (aiErr) { console.error('AI food search error:', aiErr.message); }
    }

    // 4. Search Open Food Facts for packaged products (if fewer than 6 results)
    if (foods.length < 6) {
      try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,nutriments,serving_size,image_small_url,brands`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          const offFoods = (data.products || [])
            .filter(p => p.product_name && p.nutriments)
            .map(p => ({
              name: p.product_name,
              brand: p.brands || '',
              servingSize: p.serving_size || '100g',
              image: p.image_small_url || null,
              calories: Math.round(p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal'] || 0),
              protein: Math.round(p.nutriments.proteins_100g || p.nutriments.proteins || 0),
              carbs: Math.round(p.nutriments.carbohydrates_100g || p.nutriments.carbohydrates || 0),
              fat: Math.round(p.nutriments.fat_100g || p.nutriments.fat || 0),
              source: 'openfoodfacts',
            }));
          foods.push(...offFoods);
        }
      } catch {}
    }

    // Deduplicate and limit
    const seen = new Set();
    const unique = foods.filter(f => {
      const key = f.name.toLowerCase().slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);

    res.json({ foods: unique });
  } catch (error) {
    console.error('Food search error:', error);
    res.json({ foods: [] });
  }
});

// POST /api/food/analyze-photo — AI vision to identify food from photo
router.post('/analyze-photo', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'AI not configured. Set OPENAI_API_KEY in environment.' });

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // Compress the image if too large (keep under 1MB for the API)
    let imageUrl = imageBase64;
    if (!imageUrl.startsWith('data:')) {
      imageUrl = `data:image/jpeg;base64,${imageUrl}`;
    }

    console.log(`Photo analysis: sending to ${model}, image size: ${Math.round(imageUrl.length / 1024)}KB`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a nutrition expert. Analyze the food in the image and return ONLY a JSON object (no markdown, no explanation) with: { "name": "food name", "description": "brief description", "calories": number, "protein": number (grams), "carbs": number (grams), "fat": number (grams), "servingSize": "estimated portion" }. Be accurate with nutrition estimates for a single serving as shown.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What food is this? Estimate nutrition per serving.' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('AI photo error:', err);
      return res.status(400).json({ error: `AI analysis failed. Make sure your OpenAI API key supports vision models.` });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';
    console.log('AI photo response:', content);

    // Parse JSON from response (handle markdown code blocks too)
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const food = JSON.parse(jsonMatch[0]);
        return res.json({
          food: {
            name: food.name || 'Unknown food',
            description: food.description || '',
            calories: Math.round(food.calories || 0),
            protein: Math.round(food.protein || 0),
            carbs: Math.round(food.carbs || 0),
            fat: Math.round(food.fat || 0),
            servingSize: food.servingSize || '1 serving',
          }
        });
      }
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Content:', content);
    }

    res.json({ food: null, error: 'Could not parse AI response. Try again or enter manually.' });
  } catch (error) {
    console.error('Photo analysis error:', error);
    res.status(500).json({ error: `Photo analysis failed: ${error.message}` });
  }
});

module.exports = router;