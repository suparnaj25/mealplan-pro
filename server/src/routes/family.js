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

module.exports = router;