// bootstrap/openai.js
const OpenAI = require("openai");

function normalizeModel(model) {
  const m = model || "gpt-4o-mini";
  return m.includes("/") ? m : `openai/${m}`;
}

function summarizeError(err) {
  const status = err?.status || err?.response?.status || "unknown";
  const message =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    "unknown error";

  return `openrouter: ${status} ${message}`;
}

module.exports = function createOpenAIClient() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/bisbeebucky/ai-bot",
      "X-Title": "ai-bot",
    },
  });

  async function createChatCompletion(options) {
    const model = options?.model || "gpt-4o-mini";

    try {
      return await openrouter.chat.completions.create({
        ...options,
        model: normalizeModel(model),
      });
    } catch (err) {
      throw new Error(`AI provider failed: ${summarizeError(err)}`);
    }
  }

  return {
    chat: {
      completions: {
        create: createChatCompletion,
      },
    },
  };
};
