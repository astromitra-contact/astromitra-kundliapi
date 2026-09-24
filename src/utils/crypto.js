'use strict';

const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended for GCM

/**
 * Derive a 32-byte key from the configured ENCRYPTION_KEY (any length
 * string) via SHA-256, so operators can set a plain passphrase in .env
 * without having to generate/paste raw key bytes correctly.
 */
function getKey() {
  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not configured — cannot encrypt/decrypt AI provider keys.');
  }
  return crypto.createHash('sha256').update(env.ENCRYPTION_KEY).digest();
}

/**
 * Encrypt a plaintext string (e.g. a raw Gemini/Groq API key) for storage.
 * Returns a single string: base64(iv):base64(authTag):base64(ciphertext).
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Reverse of encrypt(). Throws if the value was tampered with or the key is wrong. */
function decrypt(encoded) {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = String(encoded).split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted value.');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Mask a raw API key for display: keep first 4 + last 4 chars only. */
function maskKey(rawKey) {
  const key = String(rawKey || '');
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

module.exports = { encrypt, decrypt, maskKey };
