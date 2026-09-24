#!/usr/bin/env node
'use strict';

/**
 * Usage: node scripts/hash-admin-password.js "your-new-password"
 * Prints a bcrypt hash to paste into .env as ADMIN_PASSWORD_HASH.
 * Never store the plaintext password anywhere — only this hash.
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  // eslint-disable-next-line no-console
  console.error('Usage: node scripts/hash-admin-password.js "your-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
// eslint-disable-next-line no-console
console.log(hash);
