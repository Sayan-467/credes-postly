const { Bot, webhookCallback } = require('grammy');
const {
  handleStart, handleLink, handlePost, handleHelp,
  handleStatus, handleAccounts, handleCallbackQuery, handleText,
} = require('./handlers');

let bot;

function getBot() {
  if (!bot) {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
      return null;
    }

    bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

    // ── Commands ──
    bot.command('start', handleStart);
    bot.command('link', handleLink);
    bot.command('post', handlePost);
    bot.command('help', handleHelp);
    bot.command('status', handleStatus);
    bot.command('accounts', handleAccounts);

    // ── Inline keyboard callbacks ──
    bot.on('callback_query:data', handleCallbackQuery);

    // ── Free text (idea input) ──
    bot.on('message:text', handleText);

    // ── Error handler ──
    bot.catch((err) => {
      console.error('Bot error:', err.message);
    });
  }

  return bot;
}

// Returns Express middleware for webhook mode
function getBotWebhookMiddleware() {
  const b = getBot();
  if (!b) return (req, res) => res.sendStatus(200);
  if (process.env.NODE_ENV !== 'production' || !process.env.TELEGRAM_WEBHOOK_URL) {
    return (req, res) => res.sendStatus(200);
  }
  return webhookCallback(b, 'express');
}

// Start polling (local dev only)
async function startBotPolling() {
  const b = getBot();
  if (!b) return;
  console.log('Starting Telegram bot in polling mode...');
  await b.start();
}

// Set webhook URL (call once after deployment)
async function setWebhook(url) {
  const b = getBot();
  if (!b) return;
  await b.api.setWebhook(url);
  console.log(`Telegram webhook set to: ${url}`);
}

module.exports = { getBot, getBotWebhookMiddleware, startBotPolling, setWebhook };