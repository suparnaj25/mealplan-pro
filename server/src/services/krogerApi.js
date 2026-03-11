/**
 * Kroger API Integration
 * Docs: https://developer.kroger.com/documentation
 * 
 * Provides: OAuth2 auth, product search, cart management
 */

const db = require('../db/connection');

const KROGER_BASE = 'https://api.kroger.com/v1';
const KROGER_AUTH = 'https://api.kroger.com/v1/connect/oauth2';

/**
 * Get OAuth2 authorization URL for user to connect their Kroger account
 */
function getAuthUrl(redirectUri) {
  const clientId = process.env.KROGER_CLIENT_ID;
  if (!clientId) return null;
  
  const scopes = 'product.compact cart.basic:write';
  return `${KROGER_AUTH}/authorize?scope=${encodeURIComponent(scopes)}&response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

/**
 * Exchange authorization code for access/refresh tokens
 */
async function exchangeCode(code, redirectUri) {
  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Kroger API credentials not configured');

  const res = await fetch(`${KROGER_AUTH}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kroger token exchange failed: ${err}`);
  }

  return await res.json();
}

/**
 * Refresh an expired access token
 */
async function refreshToken(refreshTokenValue) {
  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;

  const res = await fetch(`${KROGER_AUTH}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue,
    }),
  });

  if (!res.ok) throw new Error('Failed to refresh Kroger token');
  return await res.json();
}

/**
 * Get a valid access token for a user (refresh if expired)
 */
async function getValidToken(userId) {
  const store = db.prepare('SELECT kroger_access_token, kroger_refresh_token, kroger_token_expires_at FROM user_store_preferences WHERE user_id = ?').get(userId);
  if (!store || !store.kroger_access_token) return null;

  // Check if expired
  if (store.kroger_token_expires_at && new Date(store.kroger_token_expires_at) < new Date()) {
    if (!store.kroger_refresh_token) return null;
    try {
      const tokens = await refreshToken(store.kroger_refresh_token);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      db.prepare('UPDATE user_store_preferences SET kroger_access_token = ?, kroger_refresh_token = ?, kroger_token_expires_at = ? WHERE user_id = ?')
        .run(tokens.access_token, tokens.refresh_token || store.kroger_refresh_token, expiresAt, userId);
      return tokens.access_token;
    } catch {
      return null;
    }
  }

  return store.kroger_access_token;
}

/**
 * Search Kroger products
 */
async function searchProducts(accessToken, query, locationId, options = {}) {
  const params = new URLSearchParams({
    'filter.term': query,
    'filter.limit': '5',
  });
  if (locationId) params.append('filter.locationId', locationId);

  const res = await fetch(`${KROGER_BASE}/products?${params}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kroger product search failed: ${err}`);
  }

  const data = await res.json();
  return data.data || [];
}

/**
 * Score a product based on user preferences
 * Higher score = better match
 */
function scoreProduct(product, preferences = {}) {
  let score = 0;
  const { organicPreference, budgetPreference } = preferences;

  // Base score from product data
  const desc = (product.description || '').toLowerCase();
  const brand = (product.brand || '').toLowerCase();

  // Organic preference
  if (organicPreference === 'always_organic' || organicPreference === 'prefer_organic') {
    if (desc.includes('organic') || brand.includes('organic') || brand.includes('simple truth organic')) {
      score += 50;
    } else if (organicPreference === 'always_organic') {
      score -= 100; // Penalize non-organic heavily
    }
  }

  // Budget preference
  if (budgetPreference === 'economy') {
    // Prefer store brands
    if (brand.includes('kroger') || brand.includes('simple truth') || brand.includes('private selection')) {
      score += 20;
    }
  } else if (budgetPreference === 'premium') {
    // Prefer name brands
    if (!brand.includes('kroger')) score += 10;
  }

  // Prefer items with images (usually better listed)
  if (product.images && product.images.length > 0) score += 5;

  // Prefer items in stock
  if (product.items?.[0]?.inventory?.stockLevel === 'HIGH') score += 10;
  if (product.items?.[0]?.inventory?.stockLevel === 'LOW') score -= 5;

  return score;
}

/**
 * Pick the best product for a grocery item
 */
async function findBestProduct(accessToken, itemName, locationId, preferences = {}) {
  const { organicPreference } = preferences;
  
  // Build search query based on preferences
  let query = itemName;
  if (organicPreference === 'always_organic' || organicPreference === 'prefer_organic') {
    query = `organic ${itemName}`;
  }

  try {
    const products = await searchProducts(accessToken, query, locationId);
    
    if (products.length === 0) {
      // Try without organic prefix
      const fallback = await searchProducts(accessToken, itemName, locationId);
      if (fallback.length === 0) return null;
      return { product: fallback[0], alternatives: fallback.slice(1) };
    }

    // Score and sort
    const scored = products.map(p => ({
      product: p,
      score: scoreProduct(p, preferences),
    })).sort((a, b) => b.score - a.score);

    return {
      product: scored[0].product,
      alternatives: scored.slice(1).map(s => s.product),
    };
  } catch (error) {
    console.error(`Kroger search failed for "${itemName}":`, error.message);
    return null;
  }
}

/**
 * Add items to the user's Kroger cart
 * upc should be the product's UPC from items[0].itemId
 */
async function addToCart(accessToken, upc, quantity = 1) {
  console.log(`Kroger cart add: UPC=${upc}, qty=${quantity}`);
  
  const body = { items: [{ upc: upc, quantity: Math.max(1, quantity) }] };
  
  const res = await fetch(`${KROGER_BASE}/cart/add`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  console.log(`Kroger cart response: ${res.status} ${responseText}`);

  if (!res.ok) {
    throw new Error(`Cart add failed (${res.status}): ${responseText}`);
  }

  return true;
}

/**
 * Auto-fill Kroger cart with all grocery items
 * Returns a list of matched products for user review
 */
async function autoFillCart(userId, groceryItems, preferences = {}) {
  const accessToken = await getValidToken(userId);
  if (!accessToken) throw new Error('Kroger not connected. Please connect your Kroger account in Settings.');

  const store = db.prepare('SELECT kroger_location_id FROM user_store_preferences WHERE user_id = ?').get(userId);
  const locationId = store?.kroger_location_id || null;

  const results = [];

  for (const item of groceryItems) {
    if (item.checked || item.in_pantry) continue; // Skip already checked/pantry items

    const match = await findBestProduct(accessToken, item.name, locationId, preferences);

    if (match) {
      // Extract the UPC — Kroger uses items[0].itemId as the UPC for cart operations
      const firstItem = match.product.items?.[0];
      const upc = firstItem?.itemId || match.product.upc || match.product.productId;
      
      console.log(`Product match: "${item.name}" → "${match.product.description}" UPC=${upc}`);
      
      results.push({
        groceryItemId: item.id,
        groceryItemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        selectedProduct: {
          id: match.product.productId,
          upc: upc,
          name: match.product.description,
          brand: match.product.brand,
          price: firstItem?.price?.regular,
          size: firstItem?.size,
          image: match.product.images?.[0]?.sizes?.find(s => s.size === 'medium')?.url || match.product.images?.[0]?.sizes?.[0]?.url,
        },
        alternatives: (match.alternatives || []).slice(0, 3).map(p => ({
          id: p.productId,
          upc: p.upc || p.items?.[0]?.itemId,
          name: p.description,
          brand: p.brand,
          price: p.items?.[0]?.price?.regular,
          size: p.items?.[0]?.size,
          image: p.images?.[0]?.sizes?.find(s => s.size === 'medium')?.url || p.images?.[0]?.sizes?.[0]?.url,
        })),
        addedToCart: false,
      });
    } else {
      results.push({
        groceryItemId: item.id,
        groceryItemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        selectedProduct: null,
        alternatives: [],
        addedToCart: false,
        error: 'No products found',
      });
    }
  }

  return results;
}

/**
 * Search for Kroger store locations by zip code
 * Uses client credentials (no user auth needed)
 */
async function searchLocations(zipCode) {
  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Kroger API credentials not configured');

  // Get client credentials token
  const tokenRes = await fetch(`${KROGER_AUTH}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'product.compact' }),
  });
  if (!tokenRes.ok) throw new Error('Failed to get Kroger client token');
  const tokenData = await tokenRes.json();

  const params = new URLSearchParams({
    'filter.zipCode.near': zipCode,
    'filter.limit': '10',
    'filter.radiusInMiles': '15',
  });

  const res = await fetch(`${KROGER_BASE}/locations?${params}`, {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kroger location search failed: ${err}`);
  }

  const data = await res.json();
  return (data.data || []).map(loc => ({
    locationId: loc.locationId,
    name: loc.name,
    chain: loc.chain,
    address: {
      line1: loc.address?.addressLine1,
      city: loc.address?.city,
      state: loc.address?.state,
      zipCode: loc.address?.zipCode,
    },
    phone: loc.phone,
    hours: loc.hours,
  }));
}

module.exports = { getAuthUrl, exchangeCode, getValidToken, searchProducts, addToCart, autoFillCart, findBestProduct, searchLocations };
