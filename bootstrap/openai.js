// bootstrap/openai.js
const OpenAI = require("openai");

function normalizeModel(model, provider) {
  const m = model || "gpt-4o-mini";

  if (provider === "openrouter") {
    return m.includes("/") ? m : `openai/${m}`;
  }

  return m.replace(/^openai\//, "");
}

function summarizeError(provider, err) {
  const status = err?.status || err?.response?.status || "unknown";
  const message =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    "unknown error";

  return `${provider}: ${status} ${message}`;
}

module.exports = function createOpenAIClient() {
  const openrouter = process.env.OPENROUTER_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/bisbeebucky/ai-bot",
          "X-Title": "ai-bot",
        },
      })
    : null;

  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    : null;

  if (!openrouter && !openai) {
    throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY not set");
  }

  async function createChatCompletion(options) {
    const errors = [];
    const model = options?.model || "gpt-4o-mini";

    if (openai) {
      try {
        return await openai.chat.completions.create({
          ...options,
          model: normalizeModel(model, "openai"),
        });
      } catch (err) {
        errors.push(summarizeError("openai", err));
      }
    }

    if (openrouter) {
      try {
        return await openrouter.chat.completions.create({
          ...options,
          model: normalizeModel(model, "openrouter"),
        });
      } catch (err) {
        errors.push(summarizeError("openrouter", err));
      }
    }

    throw new Error(`All AI providers failed: ${errors.join(" | ")}`);
  }

  return {
    chat: {
      completions: {
        create: createChatCompletion,
      },
    },
  };
};
