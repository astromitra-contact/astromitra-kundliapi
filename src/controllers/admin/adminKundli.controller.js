'use strict';

const adminKundliService = require('../../services/admin/adminKundli.service');

async function list(req, res, next) {
  try {
    const { search, page, limit } = req.query;
    const result = await adminKundliService.listKundlis({ search, page, limit });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getDetail(req, res, next) {
  try {
    const detail = await adminKundliService.getKundliDetail(req.params.kundliId);
    res.status(200).json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
}

async function setActive(req, res, next) {
  try {
    const updated = await adminKundliService.setActive(req.params.kundliId, req.body.active);
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await adminKundliService.deleteKundli(req.params.kundliId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getDetail, setActive, remove };
