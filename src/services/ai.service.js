const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Clients ──────────────────────────────────────────────────────────────────

// Groq is OpenAI-API compatible — just point the SDK at Groq's base URL
function getGroqClient(apiKey) {
  return new OpenAI({
    apiKey: apiKey || process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

function getGeminiClient(apiKey) {
  return new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
}

// ─── Platform prompt rules ────────────────────────────────────────────────────

function buildSystemPrompt(platform, tone, language) {
  const rules = {
    twitter: `You write Twitter/X posts. STRICT rules:
- Maximum 280 characters (hard limit — count every character)
- 2-3 hashtags only, included in the 280 chars
- Start with a punchy, attention-grabbing opener
- Tone: ${tone}. Language: ${language}.
- Return ONLY the tweet text. No explanations.`,

    linkedin: `You write LinkedIn posts. STRICT rules:
- Between 800 and 1300 characters
- Professional tone ALWAYS, regardless of other instructions
- 3-5 relevant hashtags at the end
- Structure: hook → insight → value → call to action
- Language: ${language}.
- Return ONLY the post text. No explanations.`,

    instagram: `You write Instagram captions. STRICT rules:
- Engaging caption of 150-300 characters
- Add 10-15 relevant hashtags on a new line after the caption
- Use emojis naturally throughout
- Tone: ${tone}. Language: ${language}.
- Return ONLY the caption + hashtags. No explanations.`,

    threads: `You write Threads posts. STRICT rules:
- Maximum 500 characters (hard limit)
- Conversational and relatable tone
- 1-2 hashtags maximum
- Tone: ${tone}. Language: ${language}.
- Return ONLY the post text. No explanations.`,
  };

  return rules[platform] || rules.twitter;
}

function buildUserPrompt(idea, postType) {
  return `Post type: ${postType}\nCore idea: ${idea}\n\nWrite the post now.`;
}

// ─── Groq generation (Llama 3.3 70B) ─────────────────────────────────────────

async function generateWithGroq(platform, idea, postType, tone, language, userApiKey) {
  const client = getGroqClient(userApiKey);
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(platform, tone, language) },
      { role: 'user', content: buildUserPrompt(idea, postType) },
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  const content = response.choices[0].message.content.trim();
  const tokensUsed = response.usage?.total_tokens || 0;
  return { content, tokensUsed };
}

// ─── Gemini generation ────────────────────────────────────────────────────────

async function generateWithGemini(platform, idea, postType, tone, language, userApiKey) {
  const client = getGeminiClient(userApiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const model = client.getGenerativeModel({ model: modelName });

  const prompt = `${buildSystemPrompt(platform, tone, language)}\n\n${buildUserPrompt(idea, postType)}`;
  const result = await model.generateContent(prompt);
  const content = result.response.text().trim();

  // Gemini doesn't expose token counts the same way — estimate
  const tokensUsed = Math.ceil(prompt.length / 4) + Math.ceil(content.length / 4);
  return { content, tokensUsed };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractHashtags(content) {
  const matches = content.match(/#\w+/g);
  return matches || [];
}

function enforceCharLimit(content, limit) {
  if (content.length <= limit) return content;
  return content.slice(0, limit - 3) + '...';
}

// ─── Main generate function ───────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.idea
 * @param {string} params.postType
 * @param {string[]} params.platforms  e.g. ['twitter', 'linkedin']
 * @param {string} params.tone
 * @param {string} params.language
 * @param {string} params.model  'groq' | 'gemini'
 * @param {object} [params.userKeys]  { groqKey, geminiKey } — from ai_keys table
 */
async function generateContent({ idea, postType, platforms, tone, language, model, userKeys = {} }) {
  const generated = {};
  let totalTokens = 0;

  const generator = model === 'gemini'
    ? (platform) => generateWithGemini(platform, idea, postType, tone, language, userKeys.geminiKey)
    : (platform) => generateWithGroq(platform, idea, postType, tone, language, userKeys.groqKey);

  const modelUsed = model === 'gemini'
    ? (process.env.GEMINI_MODEL || 'gemini-1.5-flash')
    : (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');

  for (const platform of platforms) {
    try {
      const { content, tokensUsed } = await generator(platform.toLowerCase());
      totalTokens += tokensUsed;

      const limits = { twitter: 280, threads: 500 };
      const finalContent = limits[platform] ? enforceCharLimit(content, limits[platform]) : content;

      generated[platform] = {
        content: finalContent,
        char_count: finalContent.length,
        hashtags: extractHashtags(finalContent),
      };
    } catch (err) {
      // Partial failure — record error per platform, don't kill the whole request
      generated[platform] = {
        content: null,
        error: err.message,
      };
    }
  }

  return { generated, model_used: modelUsed, tokens_used: totalTokens };
}

module.exports = { generateContent };