const express = require('express');
const db = require('../db/connection');

const router = express.Router();

// GET /api/images/recipe?name=Chicken Tikka Masala — fetch a real food photo from Pexels
router.get('/recipe', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.json({ url: null });

    const pexelsKey = process.env.PEXELS_API_KEY;
    
    if (pexelsKey) {
      // Use Pexels API (free, 200 req/hour, excellent food photos)
      const query = name.replace(/[^a-zA-Z\s]/g, '').trim().split(' ').slice(0, 3).join(' ') + ' food';
      const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`, {
        headers: { 'Authorization': pexelsKey }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.photos?.[0]) {
          return res.json({ url: data.photos[0].src.medium });
        }
      }
    }

    // Fallback: Unsplash source (works without API key but less reliable)
    const cleaned = name.replace(/[^a-zA-Z\s]/g, '').trim().split(' ').slice(0, 3).join('+');
    res.json({ url: `https://source.unsplash.com/400x300/?${cleaned}+food` });
  } catch (error) {
    console.error('Image fetch error:', error);
    res.json({ url: null });
  }
});

module.exports = router;