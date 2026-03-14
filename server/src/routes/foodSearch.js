const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Nutritionix-style food search using Open Food Facts (free, no API key)
// GET /api/food/search?q=chicken breast
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ foods: [] });

    // Search Open Food Facts
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,nutriments,serving_size,image_small_url,brands`;
    const response = await fetch(url);
    if (!response.ok) return res.json({ foods: [] });

    const data = await response.json();
    const foods = (data.products || [])
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
        fiber: Math.round(p.nutriments.fiber_100g || p.nutriments.fiber || 0),
      }));

    res.json({ foods });
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
    if (!apiKey) return res.status(400).json({ error: 'AI not configured. Set OPENAI_API_KEY.' });

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a nutrition expert. Analyze the food in the image and return a JSON object with: { "name": "food name", "description": "brief description", "calories": number, "protein": number (grams), "carbs": number (grams), "fat": number (grams), "servingSize": "estimated portion" }. Be accurate with nutrition estimates for a single serving. Return ONLY valid JSON, no markdown.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What food is in this image? Estimate the nutrition per serving.' },
              { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
            ]
          }
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(400).json({ error: `AI analysis failed: ${err}` });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const food = JSON.parse(jsonMatch[0]);
        return res.json({ food: { name: food.name || 'Unknown food', description: food.description || '', calories: Math.round(food.calories || 0), protein: Math.round(food.protein || 0), carbs: Math.round(food.carbs || 0), fat: Math.round(food.fat || 0), servingSize: food.servingSize || '1 serving' } });
      }
    } catch {}

    res.json({ food: null, raw: content, error: 'Could not parse nutrition data' });
  } catch (error) {
    console.error('Photo analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;