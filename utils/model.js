// utils/model.js
function resolveModel() {
  return (
    process.env.OPENROUTER_MODEL ||
    process.env.MODEL ||
    process.env.DEFAULT_MODEL ||
    process.env.LLM_MODEL ||
    "openai/gpt-4o-mini"
  );
}

module.exports = { resolveModel };
