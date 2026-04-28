require('dotenv').config();
const express = require('express');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const contentRoutes = require('./routes/content.routes');
const postsRoutes = require('./routes/posts.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const { errorHandler } = require('./middleware/error.middleware');
const { getBotWebhookMiddleware, startBotPolling, setWebhook } = require('./bot');
const { startPublishWorker } = require('./workers/publish.worker');

const app = express();

app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Telegram webhook endpoint
app.post('/webhook/telegram', getBotWebhookMiddleware());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Postly API running on port ${PORT}`);

    // start BullMQ worker
    await startPublishWorker();

    // Bot setup
    try {
      if (process.env.NODE_ENV === 'production' && process.env.TELEGRAM_WEBHOOK_URL) {
        await setWebhook(process.env.TELEGRAM_WEBHOOK_URL);
      } else {
        startBotPolling();
      }
    } catch (error) {
      console.error('Telegram bot setup failed:', error);
    }
  });
}

module.exports = app;