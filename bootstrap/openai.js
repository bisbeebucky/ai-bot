// bootstrap/openai.js
const OpenAI = require("openai");

module.exports = function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://openrouter.ai/api/v1"
  });
};
