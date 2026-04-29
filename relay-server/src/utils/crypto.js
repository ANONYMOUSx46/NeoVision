'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // bytes
const IV_LENGTH = 12;  // bytes — recommended for GCM
const TAG_LENGTH = 16; // bytes

/**
 * Derives a symmetric key from a shared secret using HKDF-SHA256.
 * Used during ECDH key exchange to produce the session encryption key.
 *
 * @param {Buffer} sharedSecret - Raw ECDH shared secret
 * @param {string} salt - Session ID used as salt
 * @returns {Buffer} 32-byte derived key
 */
function deriveKey(sharedSecret, salt) {
  return crypto.hkdfSync('sha256', sharedSecret, salt, 'neovision-session-key-v1', KEY_LENGTH);
}

/**
 * Encrypts a payload with AES-256-GCM.
 * Returns a Buffer: [iv (12)] + [authTag (16)] + [ciphertext]
 *
 * @param {Buffer|string} plaintext
 * @param {Buffer} key - 32-byte symmetric key
 * @returns {Buffer}
 */
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts a payload produced by `encrypt`.
 *
 * @param {Buffer} ciphertext - Full buffer from encrypt()
 * @param {Buffer} key - 32-byte symmetric key
 * @returns {Buffer} plaintext
 */
function decrypt(ciphertext, key) {
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = ciphertext.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Generates an ECDH key pair (P-256 curve) for session key exchange.
 * The public key is sent to the other party; the private key is kept local.
 *
 * @returns {{ publicKey: Buffer, privateKey: Buffer }}
 */
function generateECDHKeyPair() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey(),
    privateKey: ecdh.getPrivateKey(),
    ecdh,
  };
}

/**
 * Computes the ECDH shared secret given our private key and the peer's public key.
 *
 * @param {crypto.ECDH} ecdh - Our ECDH instance (with private key set)
 * @param {Buffer} peerPublicKey
 * @returns {Buffer}
 */
function computeSharedSecret(ecdh, peerPublicKey) {
  return ecdh.computeSecret(peerPublicKey);
}

/**
 * Generates a cryptographically secure random token (hex string).
 *
 * @param {number} bytes - Number of random bytes (default 32)
 * @returns {string}
 */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  deriveKey,
  encrypt,
  decrypt,
  generateECDHKeyPair,
  computeSharedSecret,
  randomToken,
  safeCompare,
};
