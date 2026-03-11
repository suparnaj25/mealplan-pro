const express = require('express');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const kroger = require('../services/krogerApi');

const router = express.Router();
router.use(authenticateToken);

// GET /api/kroger/auth-url — get Kroger OAuth2 login URL
router.get('/auth-url', (req, res) => {
  const redirectUri = process.env.KROGER_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/kroger/callback`;
  const url = kroger.getAuthUrl(redirectUri);
  if (!url) return res.status(400).json({ error: 'Kroger API credentials not configured. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET.' });
  res.json({ url, redirectUri });
});

// GET /api/kroger/callback — OAuth2 callback (exchanged code for tokens)
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });

    const redirectUri = process.env.KROGER_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/kroger/callback`;
    const tokens = await kroger.exchangeCode(code, redirectUri);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    db.prepare('UPDATE user_store_preferences SET kroger_access_token = ?, kroger_refresh_token = ?, kroger_token_expires_at = ? WHERE user_id = ?')
      .run(tokens.access_token, tokens.refresh_token, expiresAt, req.user.id);

    // Redirect to settings with success
    res.redirect('/settings?kroger=connected');
  } catch (error) {
    console.error('Kroger callback error:', error);
    res.redirect('/settings?kroger=error');
  }
});

// GET /api/kroger/status — check if Kroger is connected
router.get('/status', (req, res) => {
  const store = db.prepare('SELECT kroger_access_token, kroger_token_expires_at FROM user_store_preferences WHERE user_id = ?').get(req.user.id);
  const connected = !!(store?.kroger_access_token);
  const expired = store?.kroger_token_expires_at ? new Date(store.kroger_token_expires_at) < new Date() : true;
  res.json({ connected, expired: connected && expired, configured: !!(process.env.KROGER_CLIENT_ID) });
});

// POST /api/kroger/auto-fill — auto-fill cart with grocery items
router.post('/auto-fill', async (req, res) => {
  try {
    const { groceryListId } = req.body;
    if (!groceryListId) return res.status(400).json({ error: 'groceryListId required' });

    // Get grocery items
    const list = db.prepare('SELECT * FROM grocery_lists WHERE id = ? AND user_id = ?').get(groceryListId, req.user.id);
    if (!list) return res.status(404).json({ error: 'Grocery list not found' });

    const items = db.prepare('SELECT * FROM grocery_list_items WHERE grocery_list_id = ? AND checked = 0 AND in_pantry = 0').all(groceryListId);

    // Get user preferences
    const storePrefs = db.prepare('SELECT organic_preference FROM user_store_preferences WHERE user_id = ?').get(req.user.id);
    const userPrefs = db.prepare('SELECT budget_preference FROM users WHERE id = ?').get(req.user.id);

    const results = await kroger.autoFillCart(req.user.id, items, {
      organicPreference: storePrefs?.organic_preference || 'no_preference',
      budgetPreference: userPrefs?.budget_preference || 'moderate',
    });

    res.json({ results, totalItems: items.length, matchedItems: results.filter(r => r.selectedProduct).length });
  } catch (error) {
    console.error('Kroger auto-fill error:', error);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/kroger/confirm-cart — add all selected products to Kroger cart
router.post('/confirm-cart', async (req, res) => {
  try {
    const { selections } = req.body; // [{upc, quantity}]
    if (!selections || selections.length === 0) return res.status(400).json({ error: 'No selections provided' });

    const accessToken = await kroger.getValidToken(req.user.id);
    if (!accessToken) return res.status(401).json({ error: 'Kroger not connected' });

    const results = [];
    for (const sel of selections) {
      try {
        await kroger.addToCart(accessToken, sel.upc, sel.quantity || 1);
        results.push({ upc: sel.upc, success: true });
      } catch (err) {
        results.push({ upc: sel.upc, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ results, successCount, totalCount: selections.length });
  } catch (error) {
    console.error('Kroger confirm cart error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;