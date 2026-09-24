'use strict';

const { body, param, validationResult } = require('express-validator');
const AppError = require('./AppError');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
// Opaque client-supplied id (e.g. a Flutter-generated UUID/device id) — not
// an authenticated identity, just a stable key used to look up a user's
// Kundli/credits. Alphanumeric + common id characters, no spaces/HTML.
const USER_ID_REGEX = /^[A-Za-z0-9_-]{3,128}$/;

const kundliGenerateRules = [
  body('name')
    .exists({ checkFalsy: true })
    .withMessage('name is required')
    .bail()
    .isString()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage('name must be between 1 and 120 characters')
    .matches(/^[\p{L}\p{M}\s.'-]+$/u)
    .withMessage('name contains invalid characters')
    .escape(),

  body('dateOfBirth')
    .exists({ checkFalsy: true })
    .withMessage('dateOfBirth is required')
    .bail()
    .isString()
    .matches(DATE_REGEX)
    .withMessage('dateOfBirth must be in YYYY-MM-DD format')
    .bail()
    .custom((value) => {
      const [y, m, d] = value.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const valid =
        date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
      if (!valid) throw new Error('dateOfBirth is not a real calendar date');
      const now = new Date();
      if (date > now) throw new Error('dateOfBirth cannot be in the future');
      if (y < 1800) throw new Error('dateOfBirth must be on or after the year 1800');
      return true;
    }),

  // Optional: when the exact birth time is unknown, the service falls back
  // to a default (noon) and flags the result as approximate — see
  // kundli.service.js / the `timeAccuracy` field in the response.
  body('timeOfBirth')
    .optional({ checkFalsy: true })
    .isString()
    .matches(TIME_REGEX)
    .withMessage('timeOfBirth must be in 24-hour HH:mm format'),

  body('birthPlace')
    .exists({ checkFalsy: true })
    .withMessage('birthPlace is required')
    .bail()
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('birthPlace must be between 2 and 200 characters')
    .matches(/^[\p{L}\p{M}\p{N}\s,.'-]+$/u)
    .withMessage('birthPlace contains invalid characters'),

  // Optional. Links this Kundli to a client-supplied userId so the Chat
  // API can later look it up. Omit entirely for the original, unchanged
  // no-userId behavior.
  body('userId')
    .optional({ checkFalsy: true })
    .isString()
    .matches(USER_ID_REGEX)
    .withMessage('userId must be 3-128 characters: letters, numbers, "_" or "-" only'),
];

const transitRules = [
  body('dateTime')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('dateTime must be a valid ISO 8601 date-time, e.g. 2026-08-13T10:30:00Z'),

  body('latitude')
    .optional({ checkFalsy: false })
    .isFloat({ min: -90, max: 90 })
    .withMessage('latitude must be between -90 and 90'),

  body('longitude')
    .optional({ checkFalsy: false })
    .isFloat({ min: -180, max: 180 })
    .withMessage('longitude must be between -180 and 180'),

  body('place')
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('place must be between 2 and 200 characters'),
];

const updateKundliRules = [
  body('name')
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 120 })
    .matches(/^[\p{L}\p{M}\s.'-]+$/u)
    .withMessage('name contains invalid characters')
    .escape(),

  body('dateOfBirth')
    .optional({ checkFalsy: true })
    .isString()
    .matches(DATE_REGEX)
    .withMessage('dateOfBirth must be in YYYY-MM-DD format'),

  body('timeOfBirth')
    .optional({ checkFalsy: true })
    .isString()
    .matches(TIME_REGEX)
    .withMessage('timeOfBirth must be in 24-hour HH:mm format'),

  body('birthPlace')
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .matches(/^[\p{L}\p{M}\p{N}\s,.'-]+$/u)
    .withMessage('birthPlace contains invalid characters'),

  body().custom((value) => {
    const allowed = ['name', 'dateOfBirth', 'timeOfBirth', 'birthPlace'];
    const hasAtLeastOne = allowed.some((key) => value[key] !== undefined && value[key] !== '');
    if (!hasAtLeastOne) {
      throw new Error('Provide at least one field to update: name, dateOfBirth, timeOfBirth, or birthPlace.');
    }
    return true;
  }),
];

const chatAskRules = [
  // kundliId is now the sole reference: it's already unique per record in
  // MongoDB, so it identifies both "which chart" AND "whose daily credit
  // ledger" — no separate userId needed.
  body('kundliId')
    .exists({ checkFalsy: true })
    .withMessage('kundliId is required')
    .bail()
    .isMongoId()
    .withMessage('kundliId must be a valid Kundli id (the kundliId returned by /api/kundli/generate)'),

  body('question')
    .exists({ checkFalsy: true })
    .withMessage('question is required')
    .bail()
    .isString()
    .trim()
    .isLength({ min: 3, max: 1000 })
    .withMessage('question must be between 3 and 1000 characters'),
];

const chatRewardRules = [
  body('kundliId')
    .exists({ checkFalsy: true })
    .withMessage('kundliId is required')
    .bail()
    .isMongoId()
    .withMessage('kundliId must be a valid Kundli id (the kundliId returned by /api/kundli/generate)'),
];

const chatCreditStatusRules = [
  param('kundliId')
    .exists({ checkFalsy: true })
    .withMessage('kundliId is required')
    .bail()
    .isMongoId()
    .withMessage('kundliId must be a valid Kundli id (the kundliId returned by /api/kundli/generate)'),
];

function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(new AppError('Invalid request body.', 400, 'VALIDATION_ERROR', details));
  }
  return next();
}

module.exports = {
  kundliGenerateRules,
  transitRules,
  updateKundliRules,
  chatAskRules,
  chatRewardRules,
  chatCreditStatusRules,
  validate,
};
