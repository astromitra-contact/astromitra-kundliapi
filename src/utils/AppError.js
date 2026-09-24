'use strict';

/**
 * Operational error with an HTTP status code attached.
 * Anything thrown as AppError is considered "expected" (bad input, upstream
 * lookup failure, etc.) and is safe to describe to the client. Anything else
 * (a bug) is logged server-side and reported to the client as a generic 500.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
