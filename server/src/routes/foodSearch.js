const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const nutritionix = require('../services/nutritionix');

const router = express.Router();
router.use(authenticateToken);

// Common meals (instant fallback)
const COMMON_MEALS = [
  { name: 'Chicken Breast (grilled, 6oz)', calories: 280, protein: 53, carbs: 0, fat: 6 },
  { name: 'Salmon Fillet (baked, 6oz)', calories: 350, protein: 38, carbs: 0, fat: 20 },
  { name: 'Brown Rice (1 cup cooked)', calories: 215, protein: 5, carbs: 45, fat: 2 },
  { name: 'Scrambled Eggs (2 eggs)', calories: 180, protein: 12, carbs: 2, fat: 14 },
  { name: 'Greek Yogurt (1 cup)', calories: 130, protein: 22, carbs: 9, fat: 0 },
  { name: 'Avocado (1 whole)', calories: 240, protein: 3, carbs: 13, fat: 22 },
  { name: 'Banana (1 medium)', calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: 'Chicken Caesar Salad', calories: 440, protein: 38, carbs: 18, fat: 24 },
  { name: 'Pizza (2 slices)', calories: 570, protein: 22, carbs: 60, fat: 26 },
  { name: 'Burrito Bowl', calories: 520, protein: 28, carbs: 55, fat: 20 },
  { name: 'Protein Shake', calories: 200, protein: 30, carbs: 10, fat: 5 },
  { name: 'Oatmeal (1 cup cooked)', calories: 160, protein: 6, carbs: 27, fat: 3 },
  { name: 'Tofu (firm, 1/2 block)', calories: 180, protein: 20, carbs: 4, fat: 10 },
];

// GET /api/food/search?q=chicken breast — multi-tier search
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ foods: [] });
    const query = q.toLowerCase();
    const foods = [];

    // Tier 1: Common meals (instant)
    const common = COMMON_MEALS.filter(m => m.name.toLowerCase().includes(query)).slice(0, 3);
    foods.push(...common.map(m => ({ ...m, brand: '', image: null, source: 'common' })));

    // Tier 2: Nutritionix instant search (if configured)
    if (nutritionix.isConfigured() && foods.length < 6) {
      const nxResults = await nutritionix.searchFoods(q);
      for (const nx of nxResults) {
        // Get full nutrition for each result
        const nutrition = await nutritionix.getNutrition(nx.name);
        if (nutrition) {
          foods.push({ name: nx.name, brand: nx.brand || '✅ Verified', image: nx.photo, calories: nutrition.calories, protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat, source: 'nutritionix' });
        } else {
          foods.push({ name: nx.name, brand: nx.brand || '', image: nx.photo, calories: 0, protein: 0, carbs: 0, fat: 0, source: 'nutritionix' });
        }
        if (foods.length >= 8) break;
      }
    }

    // Tier 3: Recipe DB
    if (foods.length < 8) {
      const db = require('../db/connection');
      const recipes = db.prepare('SELECT name, nutrition FROM recipes WHERE name LIKE ? LIMIT 3').all(`%${q}%`);
      for (const r of recipes) {
        try {
          const n = JSON.parse(r.nutrition || '{}');
          foods.push({ name: r.name, brand: 'My Recipes', image: null, calories: n.calories || 0, protein: n.protein || 0, carbs: n.carbs || 0, fat: n.fat || 0, source: 'recipe' });
        } catch {}
      }
    }

    // Tier 4: AI estimation (if no Nutritionix and few results)
    if (foods.length < 3 && !nutritionix.isConfigured() && process.env.OPENAI_API_KEY) {
      try {
        const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const model = process.env.OPENAI_MODEL || 'gpt-4o';
        const aiRes = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, temperature: 0.2, max_tokens: 200,
            messages: [
              { role: 'system', content: 'Return ONLY JSON: { "name": "food with portion", "calories": number, "protein": number, "carbs": number, "fat": number }' },
              { role: 'user', content: `Nutrition for: ${q}` }
            ]
          }),
        });
        if (aiRes.ok) {
          const data = await aiRes.json();
          const content = (data.choices?.[0]?.message?.content || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            const f = JSON.parse(match[0]);
            foods.unshift({ name: f.name || q, brand: '✨ AI', image: null, calories: Math.round(f.calories||0), protein: Math.round(f.protein||0), carbs: Math.round(f.carbs||0), fat: Math.round(f.fat||0), source: 'ai' });
          }
        }
      } catch {}
    }

    // Deduplicate
    const seen = new Set();
    const unique = foods.filter(f => { const k = f.name.toLowerCase().slice(0, 25); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
    res.json({ foods: unique });
  } catch (error) { console.error('Food search error:', error); res.json({ foods: [] }); }
});

// POST /api/food/analyze-photo — GPT-4o Vision → Nutritionix chain
router.post('/analyze-photo', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'AI not configured. Set OPENAI_API_KEY.' });

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o'; // Use full GPT-4o for better accuracy

    let imageUrl = imageBase64;
    if (!imageUrl.startsWith('data:')) imageUrl = `data:image/jpeg;base64,${imageUrl}`;

    console.log(`📷 Photo analysis: ${model}, detail: high, image: ${Math.round(imageUrl.length/1024)}KB`);

    // Step 1: GPT-4o Vision identifies the food
    const gptRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Identify the food in this image. Return ONLY a JSON: { "name": "detailed food description with estimated portion", "items": ["item1 with portion", "item2 with portion"] }. Be specific about portions.' },
          { role: 'user', content: [
            { type: 'text', text: 'What food is this? Describe each item with estimated portion size.' },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
          ]}
        ],
        max_tokens: 300, temperature: 0.3,
      }),
    });

    if (!gptRes.ok) {
      const err = await gptRes.text();
      return res.status(400).json({ error: `AI analysis failed: ${err.slice(0, 200)}` });
    }

    const gptData = await gptRes.json();
    const gptContent = (gptData.choices?.[0]?.message?.content || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    console.log('📷 GPT identified:', gptContent);

    let foodName = '';
    try {
      const parsed = JSON.parse(gptContent.match(/\{[\s\S]*\}/)?.[0] || '{}');
      foodName = parsed.items?.join(', ') || parsed.name || '';
    } catch { foodName = gptContent.replace(/[{}"]/g, '').slice(0, 100); }

    if (!foodName) return res.json({ food: null, error: 'Could not identify food' });

    // Step 2: Nutritionix verifies macros (if configured)
    if (nutritionix.isConfigured()) {
      console.log(`📷 Nutritionix lookup: "${foodName}"`);
      const nxData = await nutritionix.getNutrition(foodName);
      if (nxData) {
        console.log(`📷 Nutritionix result: ${nxData.calories} cal, ${nxData.protein}g P`);
        return res.json({
          food: { name: foodName, description: `Verified by Nutritionix (${nxData.items.length} items)`, calories: nxData.calories, protein: nxData.protein, carbs: nxData.carbs, fat: nxData.fat, servingSize: nxData.items.map(i => i.serving).join(', '), verified: true, items: nxData.items }
        });
      }
    }

    // Step 3: Fallback to GPT macro estimation
    console.log('📷 Falling back to GPT macro estimation');
    const macroRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0.2, max_tokens: 200,
        messages: [
          { role: 'system', content: 'Return ONLY JSON: { "calories": number, "protein": number, "carbs": number, "fat": number }' },
          { role: 'user', content: `Estimate nutrition for: ${foodName}` }
        ]
      }),
    });

    if (macroRes.ok) {
      const macroData = await macroRes.json();
      const mc = (macroData.choices?.[0]?.message?.content || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const match = mc.match(/\{[\s\S]*\}/);
      if (match) {
        const m = JSON.parse(match[0]);
        return res.json({ food: { name: foodName, description: 'AI estimate', calories: Math.round(m.calories||0), protein: Math.round(m.protein||0), carbs: Math.round(m.carbs||0), fat: Math.round(m.fat||0), verified: false } });
      }
    }

    res.json({ food: null, error: 'Could not estimate nutrition' });
  } catch (error) {
    console.error('Photo analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;