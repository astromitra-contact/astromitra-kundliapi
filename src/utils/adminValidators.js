'use strict';

const { body, param, query, validationResult } = require('express-validator');
const AppError = require('./AppError');

function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(new AppError('Invalid request.', 400, 'VALIDATION_ERROR', details));
  }
  return next();
}

const adminLoginRules = [
  body('email').exists({ checkFalsy: true }).withMessage('email is required').bail().isEmail().withMessage('email must be valid'),
  body('password').exists({ checkFalsy: true }).withMessage('password is required'),
];

const listKundliRules = [
  query('search').optional({ checkFalsy: true }).isString().isLength({ max: 200 }),
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
];

const kundliIdParamRules = [param('kundliId').isMongoId().withMessage('kundliId must be a valid id')];

const setActiveRules = [
  param('kundliId').isMongoId().withMessage('kundliId must be a valid id'),
  body('active').isBoolean().withMessage('active must be true or false'),
];

const dailyUsageRules = [query('days').optional({ checkFalsy: true }).isInt({ min: 1, max: 90 }).withMessage('days must be 1-90')];

const createAiKeyRules = [
  body('provider').isIn(['gemini', 'groq']).withMessage('provider must be "gemini" or "groq"'),
  body('model').exists({ checkFalsy: true }).withMessage('model is required').isString().trim().isLength({ min: 1, max: 200 }),
  body('rawKey').exists({ checkFalsy: true }).withMessage('rawKey is required').isString().trim().isLength({ min: 8, max: 500 }),
  body('label').optional({ checkFalsy: true }).isString().trim().isLength({ max: 200 }),
  body('priority').optional({ checkFalsy: false }).isInt({ min: 1, max: 9999 }).withMessage('priority must be a positive integer'),
  body('active').optional({ checkFalsy: false }).isBoolean(),
];

const updateAiKeyRules = [
  param('id').isMongoId().withMessage('id must be a valid id'),
  body('model').optional({ checkFalsy: true }).isString().trim().isLength({ min: 1, max: 200 }),
  body('rawKey').optional({ checkFalsy: true }).isString().trim().isLength({ min: 8, max: 500 }),
  body('label').optional({ checkFalsy: true }).isString().trim().isLength({ max: 200 }),
  body('priority').optional({ checkFalsy: false }).isInt({ min: 1, max: 9999 }),
  body('active').optional({ checkFalsy: false }).isBoolean(),
];

const idParamRules = [param('id').isMongoId().withMessage('id must be a valid id')];

const listAiKeyRules = [query('provider').optional({ checkFalsy: true }).isIn(['gemini', 'groq'])];

const updateAiSettingsRules = [
  body('systemPrompt').optional({ checkFalsy: true }).isString().trim().isLength({ min: 1, max: 4000 }),
  body('astrologyInstructions').optional({ checkFalsy: true }).isString().trim().isLength({ min: 1, max: 8000 }),
  body('activeProviderPreference').optional({ checkFalsy: true }).isIn(['gemini', 'groq']),
  body().custom((value) => {
    const allowed = ['systemPrompt', 'astrologyInstructions', 'activeProviderPreference'];
    if (!allowed.some((k) => value[k] !== undefined && value[k] !== '')) {
      throw new Error('Provide at least one field to update.');
    }
    return true;
  }),
];

module.exports = {
  validate,
  adminLoginRules,
  listKundliRules,
  kundliIdParamRules,
  setActiveRules,
  dailyUsageRules,
  createAiKeyRules,
  updateAiKeyRules,
  idParamRules,
  listAiKeyRules,
  updateAiSettingsRules,
};
