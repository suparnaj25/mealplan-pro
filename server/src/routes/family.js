const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Generate a short join code
function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// GET /api/family — get current user's family info
router.get('/', (req, res) => {
  try {
    const user = db.prepare('SELECT family_id FROM users WHERE id = ?').get(req.user.id);
    if (!user?.family_id) return res.json({ family: null, members: [] });

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(user.family_id);
    if (!family) return res.json({ family: null, members: [] });

    const members = db.prepare(`
      SELECT fm.id, fm.role, fm.joined_at, u.id as user_id, u.name, u.email
      FROM family_members fm JOIN users u ON u.id = fm.user_id
      WHERE fm.family_id = ?
      ORDER BY fm.role DESC, fm.joined_at
    `).all(family.id);

    res.json({ family, members, isAdmin: family.created_by === req.user.id });
  } catch (error) {
    console.error('Get family error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/family/create — create a new family
router.post('/create', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Family name required' });

    // Check if user already in a family
    const user = db.prepare('SELECT family_id FROM users WHERE id = ?').get(req.user.id);
    if (user?.family_id) return res.status(400).json({ error: 'You are already in a family. Leave first.' });

    const familyId = uuidv4();
    const joinCode = generateJoinCode();

    db.prepare('INSERT INTO families (id, name, join_code, created_by) VALUES (?, ?, ?, ?)')
      .run(familyId, name, joinCode, req.user.id);

    db.prepare('INSERT INTO family_members (id, family_id, user_id, role) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), familyId, req.user.id, 'admin');

    db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(familyId, req.user.id);

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId);
    res.json({ family, joinCode });
  } catch (error) {
    console.error('Create family error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/family/join — join a family with code
router.post('/join', (req, res) => {
  try {
    const { joinCode } = req.body;
    if (!joinCode) return res.status(400).json({ error: 'Join code required' });

    const user = db.prepare('SELECT family_id FROM users WHERE id = ?').get(req.user.id);
    if (user?.family_id) return res.status(400).json({ error: 'You are already in a family. Leave first.' });

    const family = db.prepare('SELECT * FROM families WHERE join_code = ?').get(joinCode.toUpperCase());
    if (!family) return res.status(404).json({ error: 'Invalid join code' });

    db.prepare('INSERT INTO family_members (id, family_id, user_id, role) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), family.id, req.user.id, 'member');

    db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(family.id, req.user.id);

    // Update household size for the family creator
    const memberCount = db.prepare('SELECT COUNT(*) as count FROM family_members WHERE family_id = ?').get(family.id);
    db.prepare('UPDATE users SET household_size = ? WHERE family_id = ?').run(memberCount.count, family.id);

    res.json({ family, message: `Joined ${family.name}!` });
  } catch (error) {
    console.error('Join family error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/family/leave — leave current family
router.post('/leave', (req, res) => {
  try {
    const user = db.prepare('SELECT family_id FROM users WHERE id = ?').get(req.user.id);
    if (!user?.family_id) return res.status(400).json({ error: 'Not in a family' });

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(user.family_id);
    
    // Remove member
    db.prepare('DELETE FROM family_members WHERE family_id = ? AND user_id = ?').run(user.family_id, req.user.id);
    db.prepare('UPDATE users SET family_id = NULL WHERE id = ?').run(req.user.id);

    // If admin left and family still has members, promote next member
    if (family?.created_by === req.user.id) {
      const nextMember = db.prepare('SELECT user_id FROM family_members WHERE family_id = ? ORDER BY joined_at LIMIT 1').get(user.family_id);
      if (nextMember) {
        db.prepare('UPDATE family_members SET role = ? WHERE family_id = ? AND user_id = ?').run('admin', user.family_id, nextMember.user_id);
        db.prepare('UPDATE families SET created_by = ? WHERE id = ?').run(nextMember.user_id, user.family_id);
      } else {
        // No members left, delete family
        db.prepare('DELETE FROM families WHERE id = ?').run(user.family_id);
      }
    }

    // Update household size
    const memberCount = db.prepare('SELECT COUNT(*) as count FROM family_members WHERE family_id = ?').get(user.family_id);
    if (memberCount.count > 0) {
      db.prepare('UPDATE users SET household_size = ? WHERE family_id = ?').run(memberCount.count, user.family_id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Leave family error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Feature 9: Meal Feedback (rate/react to meals) ──

// POST /api/family/feedback — submit feedback for a recipe
router.post('/feedback', (req, res) => {
  try {
    const { recipeId, recipeName, rating, reaction, wouldEatAgain, notes } = req.body;
    if (!recipeId) return res.status(400).json({ error: 'recipeId required' });

    const existing = db.prepare('SELECT id FROM meal_feedback WHERE user_id = ? AND recipe_id = ?').get(req.user.id, recipeId);
    
    if (existing) {
      db.prepare(`UPDATE meal_feedback SET rating = ?, reaction = ?, would_eat_again = ?, notes = ?, recipe_name = ? WHERE id = ?`)
        .run(rating || null, reaction || null, wouldEatAgain !== undefined ? (wouldEatAgain ? 1 : 0) : 1, notes || null, recipeName || null, existing.id);
      const updated = db.prepare('SELECT * FROM meal_feedback WHERE id = ?').get(existing.id);
      res.json({ feedback: updated, updated: true });
    } else {
      const id = require('uuid').v4();
      db.prepare(`INSERT INTO meal_feedback (id, user_id, recipe_id, recipe_name, rating, reaction, would_eat_again, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.user.id, recipeId, recipeName || null, rating || null, reaction || null, wouldEatAgain !== undefined ? (wouldEatAgain ? 1 : 0) : 1, notes || null);
      const created = db.prepare('SELECT * FROM meal_feedback WHERE id = ?').get(id);
      res.json({ feedback: created, created: true });
    }
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/family/feedback — get all feedback for current user
router.get('/feedback', (req, res) => {
  try {
    const feedback = db.prepare('SELECT * FROM meal_feedback WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ feedback });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/family/feedback/:recipeId — get feedback for a specific recipe
router.get('/feedback/:recipeId', (req, res) => {
  try {
    const feedback = db.prepare('SELECT * FROM meal_feedback WHERE user_id = ? AND recipe_id = ?').get(req.user.id, req.params.recipeId);
    res.json({ feedback: feedback || null });
  } catch (error) {
    console.error('Get recipe feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/family/taste-profile — AI analysis of family taste preferences
router.get('/taste-profile', async (req, res) => {
  try {
    const user = db.prepare('SELECT family_id, name FROM users WHERE id = ?').get(req.user.id);
    
    let feedbackData;
    if (user?.family_id) {
      // Get feedback from all family members
      const members = db.prepare(`
        SELECT fm.user_id, u.name FROM family_members fm JOIN users u ON u.id = fm.user_id WHERE fm.family_id = ?
      `).all(user.family_id);
      
      feedbackData = members.map(m => {
        const fb = db.prepare('SELECT * FROM meal_feedback WHERE user_id = ? ORDER BY created_at DESC').all(m.user_id);
        return { name: m.name, userId: m.user_id, feedback: fb };
      });
    } else {
      // Solo user
      const fb = db.prepare('SELECT * FROM meal_feedback WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
      feedbackData = [{ name: user?.name || 'You', userId: req.user.id, feedback: fb }];
    }

    const totalFeedback = feedbackData.reduce((sum, m) => sum + m.feedback.length, 0);
    if (totalFeedback === 0) {
      return res.json({ summary: 'No meal feedback yet! Rate some meals to get personalized taste insights.', memberProfiles: [], familyFavorites: [], suggestions: [] });
    }

    const ai = require('../services/aiService');
    const result = await ai.analyzeFamilyTastes(feedbackData);
    res.json(result);
  } catch (error) {
    console.error('Taste profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
