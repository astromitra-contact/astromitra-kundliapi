'use strict';

const adminStatsService = require('../../services/admin/adminStats.service');

async function getDashboard(req, res, next) {
  try {
    const stats = await adminStatsService.getDashboardStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

async function getDailyUsage(req, res, next) {
  try {
    const usage = await adminStatsService.getDailyUsage(req.query.days);
    res.status(200).json({ success: true, data: usage });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard, getDailyUsage };
