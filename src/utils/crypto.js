const CryptoJS = require('crypto-js');

const KEY = process.env.ENCRYPTION_KEY;

if (!KEY || KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters');
}

function encrypt(plaintext) {
  if (!plaintext) return null;
  return CryptoJS.AES.encrypt(plaintext, KEY).toString();
}

function decrypt(ciphertext) {
  if (!ciphertext) return null;
  const bytes = CryptoJS.AES.decrypt(ciphertext, KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

module.exports = { encrypt, decrypt };