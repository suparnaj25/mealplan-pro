const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ── Startup safety checks ──
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('❌ FATAL: JWT_SECRET must be set and at least 16 characters. Exiting.');
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const preferencesRoutes = require('./routes/preferences');
const mealsRoutes = require('./routes/meals');
const pantryRoutes = require('./routes/pantry');
const groceriesRoutes = require('./routes/groceries');
const recipesRoutes = require('./routes/recipes');
const krogerRoutes = require('./routes/kroger');
const userRecipesRoutes = require('./routes/userRecipes');
const aiRoutes = require('./routes/ai');
const familyRoutes = require('./routes/family');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? false : true),
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Rate limiting — strict on auth, moderate on AI (expensive), relaxed on general API
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts. Please try again in 15 minutes.' }, standardHeaders: true, legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'AI rate limit reached. Please wait a moment.' }, standardHeaders: true, legacyHeaders: false });
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api/', generalLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/meals', mealsRoutes);
app.use('/api/pantry', pantryRoutes);
app.use('/api/groceries', groceriesRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/kroger', krogerRoutes);
app.use('/api/user-recipes', userRecipesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/tracker', require('./routes/tracker'));
app.use('/api/food', require('./routes/foodSearch'));
app.use('/api/images', require('./routes/images'));

// Serve static React build in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🍽️  MealPlan Pro running on port ${PORT}`);
});

module.exports = app;