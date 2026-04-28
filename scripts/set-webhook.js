#!/usr/bin/env node
/**
 * Run this ONCE after deployment to register your webhook with Telegram 
 * Usage: node scripts/set-webhook.js
 */
require('dotenv').config();
const https = require('https');

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

if (!token || !webhookUrl) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_URL must be set in .env');
  process.exit(1);
}

const body = JSON.stringify({ url: webhookUrl });
const options = {
  hostname: 'api.telegram.org',
  path: `/bot${token}/setWebhook`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.ok) {
      console.log(`✅ Webhook set successfully → ${webhookUrl}`);
    } else {
      console.error('❌ Failed to set webhook:', result.description);
    }
  });
});

req.on('error', (err) => console.error('Request error:', err.message));
req.write(body);
req.end();