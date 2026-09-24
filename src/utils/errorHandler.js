'use strict';

const env = require('../config/env');
const AppError = require('./AppError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isProd = env.NODE_ENV === 'production';

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong while processing your request.';
  let details;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.type === 'entity.parse.failed') {
    // Malformed JSON body from express.json()
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body must be valid JSON.';
  }

  // Always log full detail server-side for operators.
  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.originalUrl} -> ${statusCode} ${code}: ${err.message}`);
  if (!err.isOperational) {
    // eslint-disable-next-line no-console
    console.error(err.stack);
  }

  const body = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    body.error.details = details;
  }

  // Never leak stack traces or internal error internals in production.
  if (!isProd && !(err instanceof AppError)) {
    body.error.debug = { message: err.message, stack: err.stack };
  }

  res.status(statusCode).json(body);
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} does not exist.`,
    },
  });
}

module.exports = { errorHandler, notFoundHandler };
