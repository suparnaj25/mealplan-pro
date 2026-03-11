const express = require('express');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const kroger = require('../services/krogerApi');

const router = express.Router();

// GET /api/kroger/callback — OAuth2 callback (NO auth required — redirect from Kroger)
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('Missing authorization code. Please try connecting again.');

    // state contains the userId passed during auth-url generation
    const userId = state;
    if (!userId) return res.status(400).send('Missing user context. Please try connecting again from the app.');

    const redirectUri = process.env.KROGER_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/kroger/callback`;
    const tokens = await kroger.exchangeCode(code, redirectUri);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    db.prepare('UPDATE user_store_preferences SET kroger_access_token = ?, kroger_refresh_token = ?, kroger_token_expires_at = ? WHERE user_id = ?')
      .run(tokens.access_token, tokens.refresh_token, expiresAt, userId);

    // Redirect to the app's grocery page with success indicator
    res.redirect('/groceries?kroger=connected');
  } catch (error) {
    console.error('Kroger callback error:', error);
    res.redirect('/groceries?kroger=error');
  }
});

// All routes below require JWT auth
router.use(authenticateToken);

// GET /api/kroger/auth-url — get Kroger OAuth2 login URL (includes user ID in state)
router.get('/auth-url', (req, res) => {
  const redirectUri = process.env.KROGER_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/kroger/callback`;
  const clientId = process.env.KROGER_CLIENT_ID;
  if (!clientId) return res.status(400).json({ error: 'Kroger API credentials not configured. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET.' });

  const scopes = 'product.compact cart.basic:write';
  // Pass user ID in state parameter so callback knows which user to update
  const url = `https://api.kroger.com/v1/connect/oauth2/authorize?scope=${encodeURIComponent(scopes)}&response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${req.user.id}`;
  res.json({ url, redirectUri });
});

// GET /api/kroger/status — check if Kroger is connected
router.get('/status', (req, res) => {
  const store = db.prepare('SELECT kroger_access_token, kroger_token_expires_at, kroger_location_id FROM user_store_preferences WHERE user_id = ?').get(req.user.id);
  const connected = !!(store?.kroger_access_token);
  const expired = store?.kroger_token_expires_at ? new Date(store.kroger_token_expires_at) < new Date() : true;
  res.json({ connected, expired: connected && expired, configured: !!(process.env.KROGER_CLIENT_ID), locationId: store?.kroger_location_id || null });
});

// GET /api/kroger/locations?zipCode=98101 — search for nearby Kroger stores
router.get('/locations', async (req, res) => {
  try {
    const { zipCode } = req.query;
    if (!zipCode) return res.status(400).json({ error: 'zipCode query parameter required' });
    const locations = await kroger.searchLocations(zipCode);
    res.json({ locations });
  } catch (error) {
    console.error('Kroger locations error:', error);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/kroger/set-location — save preferred Kroger store location
router.post('/set-location', (req, res) => {
  try {
    const { locationId } = req.body;
    if (!locationId) return res.status(400).json({ error: 'locationId required' });
    db.prepare('UPDATE user_store_preferences SET kroger_location_id = ? WHERE user_id = ?').run(locationId, req.user.id);
    res.json({ success: true, locationId });
  } catch (error) {
    console.error('Set location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/kroger/auto-fill — auto-fill cart with grocery items
router.post('/auto-fill', async (req, res) => {
  try {
    const { groceryListId } = req.body;
    if (!groceryListId) return res.status(400).json({ error: 'groceryListId required' });

    const list = db.prepare('SELECT * FROM grocery_lists WHERE id = ? AND user_id = ?').get(groceryListId, req.user.id);
    if (!list) return res.status(404).json({ error: 'Grocery list not found' });

    const items = db.prepare('SELECT * FROM grocery_list_items WHERE grocery_list_id = ? AND checked = 0 AND in_pantry = 0').all(groceryListId);

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
    const { selections } = req.body;
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