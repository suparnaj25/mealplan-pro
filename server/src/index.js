const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const preferencesRoutes = require('./routes/preferences');
const mealsRoutes = require('./routes/meals');
const pantryRoutes = require('./routes/pantry');
const groceriesRoutes = require('./routes/groceries');
const recipesRoutes = require('./routes/recipes');
const krogerRoutes = require('./routes/kroger');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || true, // Allow all origins in production (same-origin serving)
  credentials: true,
}));
app.use(express.json());

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
