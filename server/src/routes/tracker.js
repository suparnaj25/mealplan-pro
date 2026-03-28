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
    const macros = db.prepare('SELECT calories, protein_g, carbs_g, fat_g, fiber_g FROM user_macros WHERE user_id = ?').get(req.user.id);

    // Calculate totals
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    for (const log of logs) {
      if (log.status === 'eaten' || log.status === 'modified') {
        totals.calories += log.calories || 0;
        totals.protein += log.protein_g || 0;
        totals.carbs += log.carbs_g || 0;
        totals.fat += log.fat_g || 0;
        totals.fiber += log.fiber_g || 0;
      }
    }

    res.json({
      date,
      logs,
      totals,
      targets: macros ? { calories: macros.calories || 2000, protein: macros.protein_g || 150, carbs: macros.carbs_g || 200, fat: macros.fat_g || 67, fiber: macros.fiber_g || 25 } : { calories: 2000, protein: 150, carbs: 200, fat: 67, fiber: 25 },
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

    // Get the week start for this date (use local date components to avoid UTC shift)
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - dayOfWeek);
    const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,'0')}-${String(weekStart.getDate()).padStart(2,'0')}`;

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

      db.prepare('INSERT INTO meal_logs (id, user_id, date, meal_type, recipe_name, recipe_id, status, calories, protein_g, carbs_g, fat_g, fiber_g) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(uuidv4(), req.user.id, date, item.meal_type, item.name, item.recipe_id, 'planned',
          Math.round((nutrition.calories || 0) * scale),
          Math.round((nutrition.protein || 0) * scale),
          Math.round((nutrition.carbs || 0) * scale),
          Math.round((nutrition.fat || 0) * scale),
          Math.round((nutrition.fiber || 0) * scale));
      synced++;
    }

    res.json({ synced, message: `Synced ${synced} planned meals` });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /api/tracker/:logId — update a meal log (mark eaten, skipped, or modified)
router.put('/:logId', (req, res) => {
  try {
    const { status, actualDescription, calories, proteinG, carbsG, fatG, fiberG } = req.body;

    const log = db.prepare('SELECT * FROM meal_logs WHERE id = ? AND user_id = ?').get(req.params.logId, req.user.id);
    if (!log) return res.status(404).json({ error: 'Not found' });

    if (status) db.prepare('UPDATE meal_logs SET status = ? WHERE id = ?').run(status, req.params.logId);
    if (actualDescription !== undefined) db.prepare('UPDATE meal_logs SET actual_description = ? WHERE id = ?').run(actualDescription, req.params.logId);
    if (calories !== undefined) db.prepare('UPDATE meal_logs SET calories = ? WHERE id = ?').run(calories, req.params.logId);
    if (proteinG !== undefined) db.prepare('UPDATE meal_logs SET protein_g = ? WHERE id = ?').run(proteinG, req.params.logId);
    if (carbsG !== undefined) db.prepare('UPDATE meal_logs SET carbs_g = ? WHERE id = ?').run(carbsG, req.params.logId);
    if (fatG !== undefined) db.prepare('UPDATE meal_logs SET fat_g = ? WHERE id = ?').run(fatG, req.params.logId);
    if (fiberG !== undefined) db.prepare('UPDATE meal_logs SET fiber_g = ? WHERE id = ?').run(fiberG, req.params.logId);

    const updated = db.prepare('SELECT * FROM meal_logs WHERE id = ?').get(req.params.logId);
    res.json({ log: updated });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/tracker/quick-add — add a custom food entry
router.post('/quick-add', (req, res) => {
  try {
    const { date, mealType, description, calories, proteinG, carbsG, fatG, fiberG } = req.body;
    if (!date || !mealType) return res.status(400).json({ error: 'date and mealType required' });

    const id = uuidv4();
    db.prepare('INSERT INTO meal_logs (id, user_id, date, meal_type, recipe_name, status, actual_description, calories, protein_g, carbs_g, fat_g, fiber_g) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.user.id, date, mealType, description || 'Custom food', 'eaten', description, calories || 0, proteinG || 0, carbsG || 0, fatG || 0, fiberG || 0);

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
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      const logs = db.prepare('SELECT * FROM meal_logs WHERE user_id = ? AND date = ? AND (status = \'eaten\' OR status = \'modified\')').all(req.user.id, dateStr);
      const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
      for (const log of logs) {
        totals.calories += log.calories || 0;
        totals.protein += log.protein_g || 0;
        totals.carbs += log.carbs_g || 0;
        totals.fat += log.fat_g || 0;
        totals.fiber += log.fiber_g || 0;
      }
      days.push({ date: dateStr, totals, mealCount: logs.length });
    }

    res.json({ days });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/tracker/weight — log weight
router.post('/weight', (req, res) => {
  try {
    const { date, weight, unit } = req.body;
    if (!date || !weight) return res.status(400).json({ error: 'date and weight required' });
    db.prepare('INSERT INTO daily_weight (id, user_id, date, weight, unit) VALUES (?,?,?,?,?) ON CONFLICT(user_id, date) DO UPDATE SET weight=?, unit=?')
      .run(uuidv4(), req.user.id, date, weight, unit || 'lb', weight, unit || 'lb');
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/tracker/weight-history — get weight history
router.get('/weight-history', (req, res) => {
  try {
    const weights = db.prepare('SELECT date, weight, unit FROM daily_weight WHERE user_id = ? ORDER BY date DESC LIMIT 30').all(req.user.id);
    res.json({ weights: weights.reverse() });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/tracker/streaks — get user streaks and achievements
router.get('/streaks', (req, res) => {
  try {
    // Helper: get today's date string in local time
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    // Get all distinct logged dates (DESC order)
    const logs = db.prepare("SELECT DISTINCT date FROM meal_logs WHERE user_id = ? AND status IN ('eaten', 'modified') ORDER BY date DESC").all(req.user.id);

    // --- CURRENT STREAK ---
    // Count consecutive days ending at today or yesterday
    let currentStreak = 0;
    if (logs.length > 0) {
      const mostRecentDate = logs[0].date;
      const diffFromToday = Math.round((new Date(today + 'T12:00:00') - new Date(mostRecentDate + 'T12:00:00')) / (1000*60*60*24));
      // Most recent log must be today or yesterday to have an active streak
      if (diffFromToday <= 1) {
        currentStreak = 1;
        for (let i = 1; i < logs.length; i++) {
          const prev = new Date(logs[i-1].date + 'T12:00:00');
          const curr = new Date(logs[i].date + 'T12:00:00');
          const dayDiff = Math.round((prev - curr) / (1000*60*60*24));
          if (dayDiff === 1) { currentStreak++; }
          else break;
        }
      }
    }

    // --- LONGEST STREAK ---
    // Scan all logged dates in chronological order
    let longestStreak = 0;
    if (logs.length > 0) {
      const chronological = [...logs].reverse();
      let streak = 1;
      for (let i = 1; i < chronological.length; i++) {
        const prev = new Date(chronological[i-1].date + 'T12:00:00');
        const curr = new Date(chronological[i].date + 'T12:00:00');
        const dayDiff = Math.round((curr - prev) / (1000*60*60*24));
        if (dayDiff === 1) { streak++; }
        else { streak = 1; }
        longestStreak = Math.max(longestStreak, streak);
      }
      // Final comparison after loop (handles streak at end of list)
      longestStreak = Math.max(longestStreak, streak);
    }
    // Ensure longestStreak is at least currentStreak
    longestStreak = Math.max(longestStreak, currentStreak);

    // --- TOTAL STATS ---
    const totalDays = logs.length;
    const totalMealsRow = db.prepare("SELECT COUNT(*) as count FROM meal_logs WHERE user_id = ? AND status IN ('eaten', 'modified')").get(req.user.id);
    const totalMeals = totalMealsRow?.count || 0;

    // --- PROTEIN HIT DAYS (last 7 calendar days from today, using explicit date range) ---
    const macros = db.prepare('SELECT calories, protein_g FROM user_macros WHERE user_id = ?').get(req.user.id);
    const proteinTarget = macros?.protein_g || 150;
    const calorieTarget = macros?.calories || 2000;
    let proteinHitDays = 0;
    if (totalDays > 0) {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth()+1).padStart(2,'0')}-${String(sevenDaysAgo.getDate()).padStart(2,'0')}`;
      const last7 = db.prepare("SELECT date, SUM(protein_g) as total_protein FROM meal_logs WHERE user_id = ? AND status IN ('eaten','modified') AND date >= ? AND date <= ? GROUP BY date HAVING total_protein >= ?")
        .all(req.user.id, sevenDaysAgoStr, today, proteinTarget);
      proteinHitDays = last7.length;
    }

    // --- WEEKLY GOAL MET (weeks where avg daily calories within 15% of target) ---
    // Use Monday-based week grouping with explicit date math instead of strftime('%W')
    let weeklyGoalMet = 0;
    if (totalDays > 0) {
      const allLogs = db.prepare("SELECT date, SUM(calories) as day_cal FROM meal_logs WHERE user_id = ? AND status IN ('eaten','modified') GROUP BY date ORDER BY date").all(req.user.id);
      // Group by ISO week (Monday-based)
      const weekMap = {};
      for (const row of allLogs) {
        const d = new Date(row.date + 'T12:00:00');
        const jsDay = d.getDay();
        const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
        const monday = new Date(d);
        monday.setDate(d.getDate() + mondayOffset);
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
        if (!weekMap[weekKey]) weekMap[weekKey] = [];
        weekMap[weekKey].push(row.day_cal || 0);
      }
      for (const [, dayCals] of Object.entries(weekMap)) {
        if (dayCals.length >= 3) { // Need at least 3 days of data for a meaningful week
          const avgCal = dayCals.reduce((s, c) => s + c, 0) / dayCals.length;
          if (calorieTarget > 0 && Math.abs(avgCal - calorieTarget) / calorieTarget <= 0.15) weeklyGoalMet++;
        }
      }
    }

    // --- ACHIEVEMENTS ---
    // Streak-based achievements use longestStreak (permanent once earned)
    // This ensures users don't lose badges when their current streak resets
    res.json({
      currentStreak,
      longestStreak,
      totalDays,
      totalDaysLogged: totalDays,
      totalMealsLogged: totalMeals,
      weeklyGoalMet,
      proteinHitDays,
      achievements: [
        { id: 'first_log', name: 'First Log', icon: '🎉', earned: totalDays >= 1, desc: 'Logged your first meal' },
        { id: 'streak_3', name: '3-Day Streak', icon: '🔥', earned: longestStreak >= 3, desc: '3 consecutive days of logging' },
        { id: 'streak_7', name: 'Week Warrior', icon: '💪', earned: longestStreak >= 7, desc: '7-day logging streak' },
        { id: 'streak_14', name: 'Consistency King', icon: '👑', earned: longestStreak >= 14, desc: '14-day logging streak' },
        { id: 'streak_30', name: 'Monthly Master', icon: '🏆', earned: longestStreak >= 30, desc: '30-day logging streak' },
        { id: 'protein_5', name: 'Protein Pro', icon: '💪', earned: proteinHitDays >= 5, desc: 'Hit protein target 5/7 days this week' },
        { id: 'total_10', name: 'Dedicated', icon: '⭐', earned: totalDays >= 10, desc: 'Logged meals on 10+ different days' },
        { id: 'total_30', name: 'Veteran', icon: '🎖️', earned: totalDays >= 30, desc: 'Logged meals on 30+ different days' },
      ],
    });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
