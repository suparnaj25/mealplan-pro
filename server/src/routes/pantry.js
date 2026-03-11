const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM pantry_items WHERE user_id = ? ORDER BY category, name').all(req.user.id);
    res.json({ items });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', (req, res) => {
  try {
    const { name, quantity, unit, category, expiryDate, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const id = uuidv4();
    db.prepare('INSERT INTO pantry_items (id, user_id, name, quantity, unit, category, expiry_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, name, quantity || null, unit || null, category || 'Other', expiryDate || null, notes || null);
    const item = db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(id);
    res.status(201).json({ item });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/:id', (req, res) => {
  try {
    const { name, quantity, unit, category, expiryDate, notes } = req.body;
    const existing = db.prepare('SELECT * FROM pantry_items WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE pantry_items SET name=?, quantity=?, unit=?, category=?, expiry_date=?, notes=?, updated_at=datetime(\'now\') WHERE id=?')
      .run(name || existing.name, quantity !== undefined ? quantity : existing.quantity, unit || existing.unit, category || existing.category, expiryDate || existing.expiry_date, notes !== undefined ? notes : existing.notes, req.params.id);
    const item = db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(req.params.id);
    res.json({ item });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM pantry_items WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;