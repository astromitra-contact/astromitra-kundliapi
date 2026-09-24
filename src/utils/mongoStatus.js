'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');

/** True only when MONGODB_URI is configured AND the connection is live. */
function isMongoReady() {
  return env.MONGODB_ENABLED && mongoose.connection.readyState === 1;
}

module.exports = { isMongoReady };
