const prisma = require('../utils/prisma');
const { getSession, setSession, patchSession, clearSession, defaultSession } = require('./session');
const {
  postTypeKeyboard, platformKeyboard, toneKeyboard,
  modelKeyboard, confirmKeyboard,
} = require('./keyboards');
const { generatePreview, generateAndPublish, listPosts } = require('../services/content.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getLinkedUser(chatId) {
  return prisma.user.findUnique({
    where: { telegramChatId: String(chatId) },
    select: { id: true, name: true, defaultTone: true, defaultLanguage: true },
  });
}

function formatPreview(generated) {
  let msg = '📋 *Here\'s your generated content:*\n\n';
  for (const [platform, data] of Object.entries(generated)) {
    if (!data.content) {
      msg += `*${platform.toUpperCase()}* ❌ Failed to generate\n\n`;
      continue;
    }
    const icons = { twitter: '🐦', linkedin: '💼', instagram: '📸', threads: '🧵' };
    const icon = icons[platform] || '📝';
    msg += `${icon} *${platform.toUpperCase()}* (${data.char_count} chars):\n`;
    msg += `\`${data.content.slice(0, 300)}${data.content.length > 300 ? '...' : ''}\`\n\n`;
  }
  return msg;
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleStart(ctx) {
  const chatId = ctx.chat.id;
  const user = await getLinkedUser(chatId);

  if (!user) {
    return ctx.reply(
      '👋 Welcome to *Postly*!\n\nYour account is not linked yet.\n\n' +
      'To link your account, send:\n`/link YOUR_ACCESS_TOKEN`\n\n' +
      'Get your access token by calling:\n`POST /api/auth/login`',
      { parse_mode: 'Markdown' }
    );
  }

  await clearSession(chatId);
  return ctx.reply(
    `Hey ${user.name}! 👋\n\nUse /post to create a new post.\nUse /help to see all commands.`,
    { parse_mode: 'Markdown' }
  );
}

async function handleLink(ctx) {
  const chatId = ctx.chat.id;
  const parts = ctx.message.text.split(' ');
  if (parts.length < 2) {
    return ctx.reply('Usage: `/link YOUR_ACCESS_TOKEN`', { parse_mode: 'Markdown' });
  }

  const token = parts[1];
  try {
    const { verifyAccessToken } = require('../utils/jwt');
    const payload = verifyAccessToken(token);

    await prisma.user.update({
      where: { id: payload.userId },
      data: { telegramChatId: String(chatId) },
    });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    return ctx.reply(`✅ Account linked! Welcome, *${user.name}*!\n\nUse /post to get started.`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    return ctx.reply('❌ Invalid or expired token. Please login via the API and try again.');
  }
}

async function handlePost(ctx) {
  const chatId = ctx.chat.id;
  const user = await getLinkedUser(chatId);

  if (!user) {
    return ctx.reply('Please link your account first with /link YOUR_ACCESS_TOKEN');
  }

  await setSession(chatId, { ...defaultSession(), userId: user.id, state: 'AWAITING_POST_TYPE' });

  return ctx.reply('What type of post is this? 👇', {
    reply_markup: postTypeKeyboard(),
  });
}

async function handleHelp(ctx) {
  return ctx.reply(
    '*Postly Bot Commands*\n\n' +
    '/post — Create and publish a new post\n' +
    '/status — View your last 5 posts\n' +
    '/accounts — View connected social accounts\n' +
    '/link <token> — Link your Postly account\n' +
    '/help — Show this message',
    { parse_mode: 'Markdown' }
  );
}

async function handleStatus(ctx) {
  const chatId = ctx.chat.id;
  const user = await getLinkedUser(chatId);
  if (!user) return ctx.reply('Please link your account first with /link YOUR_ACCESS_TOKEN');

  const { posts } = await listPosts({ userId: user.id, page: 1, limit: 5 });

  if (!posts.length) return ctx.reply('No posts found yet. Use /post to create your first one!');

  let msg = '📊 *Your last 5 posts:*\n\n';
  for (const post of posts) {
    const statusIcons = { PUBLISHED: '✅', FAILED: '❌', QUEUED: '⏳', PROCESSING: '⚙️', CANCELLED: '🚫' };
    msg += `*${post.postType}* — ${statusIcons[post.status] || '❓'} ${post.status}\n`;
    msg += `💬 "${post.idea.slice(0, 60)}${post.idea.length > 60 ? '...' : ''}"\n`;
    for (const pp of post.platformPosts) {
      msg += `  • ${pp.platform}: ${statusIcons[pp.status] || pp.status}\n`;
    }
    msg += `📅 ${new Date(post.createdAt).toLocaleDateString()}\n\n`;
  }

  return ctx.reply(msg, { parse_mode: 'Markdown' });
}

async function handleAccounts(ctx) {
  const chatId = ctx.chat.id;
  const user = await getLinkedUser(chatId);
  if (!user) return ctx.reply('Please link your account first.');

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    select: { platform: true, handle: true, connectedAt: true },
  });

  if (!accounts.length) {
    return ctx.reply('No social accounts connected. Add them via the API: POST /api/user/social-accounts');
  }

  const icons = { TWITTER: '🐦', LINKEDIN: '💼', INSTAGRAM: '📸', THREADS: '🧵' };
  let msg = '🔗 *Connected accounts:*\n\n';
  for (const acc of accounts) {
    msg += `${icons[acc.platform] || '📱'} *${acc.platform}*`;
    if (acc.handle) msg += ` — @${acc.handle}`;
    msg += '\n';
  }

  return ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ─── Callback Query Handlers ──────────────────────────────────────────────────

async function handleCallbackQuery(ctx) {
  const chatId = ctx.chat.id;
  const data = ctx.callbackQuery.data;
  const session = await getSession(chatId);

  await ctx.answerCallbackQuery(); // dismiss loading spinner

  // ── Post type selection ──
  if (data.startsWith('type:')) {
    const postType = data.split(':')[1];
    await patchSession(chatId, { postType, state: 'AWAITING_PLATFORMS' });
    await ctx.editMessageText(
      `Post type: *${postType}* ✅\n\nWhich platforms should I post to? (tap to toggle, then confirm)`,
      { parse_mode: 'Markdown', reply_markup: platformKeyboard([]) }
    );
    return;
  }

  // ── Platform multi-select toggle ──
  if (data.startsWith('plat:') && data !== 'plat:confirm' && data !== 'plat:all') {
    const platform = data.split(':')[1];
    let platforms = [...(session.platforms || [])];
    if (platforms.includes(platform)) {
      platforms = platforms.filter((p) => p !== platform);
    } else {
      platforms.push(platform);
    }
    await patchSession(chatId, { platforms });
    await ctx.editMessageReplyMarkup({ reply_markup: platformKeyboard(platforms) });
    return;
  }

  if (data === 'plat:all') {
    const all = ['twitter', 'linkedin', 'instagram', 'threads'];
    await patchSession(chatId, { platforms: all });
    await ctx.editMessageReplyMarkup({ reply_markup: platformKeyboard(all) });
    return;
  }

  if (data === 'plat:confirm') {
    if (!session.platforms || session.platforms.length === 0) {
      await ctx.answerCallbackQuery('Please select at least one platform!');
      return;
    }
    await patchSession(chatId, { state: 'AWAITING_TONE' });
    await ctx.editMessageText(
      `Platforms: *${session.platforms.join(', ')}* ✅\n\nWhat tone should the content have?`,
      { parse_mode: 'Markdown', reply_markup: toneKeyboard() }
    );
    return;
  }

  // ── Tone selection ──
  if (data.startsWith('tone:')) {
    const tone = data.split(':')[1];
    await patchSession(chatId, { tone, state: 'AWAITING_MODEL' });
    await ctx.editMessageText(
      `Tone: *${tone}* ✅\n\nWhich AI model should generate the content?`,
      { parse_mode: 'Markdown', reply_markup: modelKeyboard() }
    );
    return;
  }

  // ── Model selection ──
  if (data.startsWith('model:')) {
    const model = data.split(':')[1];
    await patchSession(chatId, { model, state: 'AWAITING_IDEA' });
    await ctx.editMessageText(
      `Model: *${model}* ✅\n\nTell me the idea or core message — keep it brief (max 500 chars):`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ── Confirmation ──
  if (data === 'confirm:post') {
    await ctx.editMessageText('⚙️ Generating and posting your content...');
    try {
      const { generated, post } = await generateAndPublish({
        userId: session.userId,
        idea: session.idea,
        postType: session.postType,
        platforms: session.platforms,
        tone: session.tone,
        language: 'en',
        model: session.model,
      });

      let msg = '🚀 *Post queued successfully!*\n\nPlatform status:\n';
      for (const [platform] of Object.entries(generated)) {
        msg += `• ${platform}: ⏳ Queued\n`;
      }
      msg += `\nPost ID: \`${post.id}\`\nUse /status to check progress.`;
      await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.editMessageText(`❌ Failed to post: ${err.message}`);
    }
    await clearSession(chatId);
    return;
  }

  if (data === 'confirm:edit') {
    await patchSession(chatId, { state: 'AWAITING_IDEA', preview: null });
    await ctx.editMessageText('✏️ Tell me the new idea or core message (max 500 chars):');
    return;
  }

  if (data === 'confirm:cancel') {
    await clearSession(chatId);
    await ctx.editMessageText('❌ Post cancelled. Use /post to start again.');
    return;
  }
}

// ─── Free text handler (idea input) ──────────────────────────────────────────

async function handleText(ctx) {
  const chatId = ctx.chat.id;
  const session = await getSession(chatId);

  if (session.state !== 'AWAITING_IDEA') return; // ignore unexpected messages

  const idea = ctx.message.text.trim().slice(0, 500);
  await patchSession(chatId, { idea, state: 'AWAITING_CONFIRMATION' });

  await ctx.reply('⚙️ Generating your content...');

  try {
    const { generated } = await generatePreview({
      userId: session.userId,
      idea,
      postType: session.postType,
      platforms: session.platforms,
      tone: session.tone,
      language: 'en',
      model: session.model,
    });

    await patchSession(chatId, { preview: generated });

    const previewMsg = formatPreview(generated);
    await ctx.reply(previewMsg + '\nConfirm and post?', {
      parse_mode: 'Markdown',
      reply_markup: confirmKeyboard(),
    });
  } catch (err) {
    await ctx.reply(`❌ AI generation failed: ${err.message}\n\nTry again with /post`);
    await clearSession(chatId);
  }
}

module.exports = {
  handleStart, handleLink, handlePost, handleHelp,
  handleStatus, handleAccounts, handleCallbackQuery, handleText,
};