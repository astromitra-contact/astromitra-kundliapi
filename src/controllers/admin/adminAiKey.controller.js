'use strict';

const aiProviderKeyService = require('../../services/ai/aiProviderKey.service');

async function list(req, res, next) {
  try {
    const keys = await aiProviderKeyService.listKeys({ provider: req.query.provider });
    res.status(200).json({ success: true, data: keys });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { provider, model, rawKey, label, priority, active } = req.body;
    const created = await aiProviderKeyService.createKey({ provider, model, rawKey, label, priority, active });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { model, rawKey, label, priority, active } = req.body;
    const updated = await aiProviderKeyService.updateKey(req.params.id, { model, rawKey, label, priority, active });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await aiProviderKeyService.deleteKey(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
