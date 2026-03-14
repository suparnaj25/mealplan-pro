const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/tracker/daily?date=2026-03-13 — get all meal logs for a day
router.get('/daily', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const logs = db.prepare('SELECT * FROM meal_logs WHERE user_id = ? AND date = ? ORDER BY CASE meal_type WHEN \'breakfast\' THEN 1 WHEN \'lunch\' THEN 2 WHEN \'dinner\' THEN 3 WHEN \'snack\' THEN 4 END').all(req.user.id, date);
    const macros = db.prepare('SELECT calories, protein_g, carbs_g, fat_g FROM user_macros WHERE user_id = ?').get(req.user.id);

    // Calculate totals
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const log of logs) {
      if (log.status === 'eaten' || log.status === 'modified') {
        totals.calories += log.calories || 0;
        totals.protein += log.protein_g || 0;
        totals.carbs += log.carbs_g || 0;
        totals.fat += log.fat_g || 0;
      }
    }

    res.json({
      date,
      logs,
      totals,
      targets: macros ? { calories: macros.calories || 2000, protein: macros.protein_g || 150, carbs: macros.carbs_g || 200, fat: macros.fat_g || 67 } : { calories: 2000, protein: 150, carbs: 200, fat: 67 },
    });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/tracker/sync-plan — sync today's planned meals into meal_logs
router.post('/sync-plan', (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });

    // Find which day of week this date is (0=Mon, 6=Sun)
    const d = new Date(date + 'T12:00:00');
    const jsDay = d.getDay(); // 0=Sun, 1=Mon...
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // Convert to 0=Mon

    // Get the week start for this date
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Find meal plan for this week
    const plan = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(req.user.id, weekStartStr);
    if (!plan) return res.json({ synced: 0, message: 'No meal plan for this week' });

    // Get planned meals for this day
    const planItems = db.prepare(`
      SELECT mpi.meal_type, mpi.recipe_id, mpi.scale_factor, r.name, r.nutrition
      FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = ? AND mpi.day_of_week = ?
    `).all(plan.id, dayOfWeek);

    let synced = 0;
    for (const item of planItems) {
      // Check if already logged
      const existing = db.prepare('SELECT id FROM meal_logs WHERE user_id = ? AND date = ? AND meal_type = ? AND recipe_id = ?').get(req.user.id, date, item.meal_type, item.recipe_id);
      if (existing) continue;

      const nutrition = item.nutrition ? JSON.parse(item.nutrition) : {};
      const scale = item.scale_factor || 1.0;

      db.prepare('INSERT INTO meal_logs (id, user_id, date, meal_type, recipe_name, recipe_id, status, calories, protein_g, carbs_g, fat_g) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(uuidv4(), req.user.id, date, item.meal_type, item.name, item.recipe_id, 'planned',
          Math.round((nutrition.calories || 0) * scale),
          Math.round((nutrition.protein || 0) * scale),
          Math.round((nutrition.carbs || 0) * scale),
          Math.round((nutrition.fat || 0) * scale));
      synced++;
    }

    res.json({ synced, message: `Synced ${synced} planned meals` });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /api/tracker/:logId — update a meal log (mark eaten, skipped, or modified)
router.put('/:logId', (req, res) => {
  try {
    const { status, actualDescription, calories, proteinG, carbsG, fatG } = req.body;

    const log = db.prepare('SELECT * FROM meal_logs WHERE id = ? AND user_id = ?').get(req.params.logId, req.user.id);
    if (!log) return res.status(404).json({ error: 'Not found' });

    if (status) db.prepare('UPDATE meal_logs SET status = ? WHERE id = ?').run(status, req.params.logId);
    if (actualDescription !== undefined) db.prepare('UPDATE meal_logs SET actual_description = ? WHERE id = ?').run(actualDescription, req.params.logId);
    if (calories !== undefined) db.prepare('UPDATE meal_logs SET calories = ? WHERE id = ?').run(calories, req.params.logId);
    if (proteinG !== undefined) db.prepare('UPDATE meal_logs SET protein_g = ? WHERE id = ?').run(proteinG, req.params.logId);
    if (carbsG !== undefined) db.prepare('UPDATE meal_logs SET carbs_g = ? WHERE id = ?').run(carbsG, req.params.logId);
    if (fatG !== undefined) db.prepare('UPDATE meal_logs SET fat_g = ? WHERE id = ?').run(fatG, req.params.logId);

    const updated = db.prepare('SELECT * FROM meal_logs WHERE id = ?').get(req.params.logId);
    res.json({ log: updated });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/tracker/quick-add — add a custom food entry
router.post('/quick-add', (req, res) => {
  try {
    const { date, mealType, description, calories, proteinG, carbsG, fatG } = req.body;
    if (!date || !mealType) return res.status(400).json({ error: 'date and mealType required' });

    const id = uuidv4();
    db.prepare('INSERT INTO meal_logs (id, user_id, date, meal_type, recipe_name, status, actual_description, calories, protein_g, carbs_g, fat_g) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.user.id, date, mealType, description || 'Custom food', 'eaten', description, calories || 0, proteinG || 0, carbsG || 0, fatG || 0);

    const log = db.prepare('SELECT * FROM meal_logs WHERE id = ?').get(id);
    res.json({ log });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/tracker/:logId — delete a log entry
router.delete('/:logId', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM meal_logs WHERE id = ? AND user_id = ?').run(req.params.logId, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/tracker/weekly?startDate=2026-03-09 — get weekly summary
router.get('/weekly', (req, res) => {
  try {
    const { startDate } = req.query;
    if (!startDate) return res.status(400).json({ error: 'startDate required' });

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate + 'T12:00:00');
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const logs = db.prepare('SELECT * FROM meal_logs WHERE user_id = ? AND date = ? AND (status = \'eaten\' OR status = \'modified\')').all(req.user.id, dateStr);
      const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      for (const log of logs) {
        totals.calories += log.calories || 0;
        totals.protein += log.protein_g || 0;
        totals.carbs += log.carbs_g || 0;
        totals.fat += log.fat_g || 0;
      }
      days.push({ date: dateStr, totals, mealCount: logs.length });
    }

    res.json({ days });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;