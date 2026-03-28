const {
  getExpenseBreakdown,
  getMonthlyCashflow,
  getIncomeStatement,
} = require("./reportService");

/**
 * Build structured financial snapshot
 */
function buildFinancialSnapshot(month) {
  const year = month.substring(0, 4);

  const expenses = getExpenseBreakdown(`${month}-01`, `${month}-31`);

  const cashflow = getMonthlyCashflow(year);
  const incomeStatement = getIncomeStatement(`${month}-01`, `${month}-31`);

  return {
    month,
    expenses,
    cashflow,
    incomeStatement,
  };
}

function calculateSavingsRate(incomeStatement) {
  let income = 0;
  let expenses = 0;

  incomeStatement.forEach((item) => {
    if (item.type === "income") income += item.amount;
    if (item.type === "expenses") expenses += Math.abs(item.amount);
  });

  if (income === 0) return 0;
  return ((income - expenses) / income) * 100;
}

function createAnalysisService(openai) {
  async function analyzeSpending(month) {
    const snapshot = buildFinancialSnapshot(month);

    const systemPrompt = `
You are a personal finance analyst.
You analyze structured financial data.
You do NOT invent numbers.
You only use provided data.
Be concise, practical, and actionable.
`;

    const userPrompt = `
Analyze the following financial data for ${month}.

Data:
${JSON.stringify(snapshot, null, 2)}

Provide:
1. Spending pattern insights
2. Largest cost drivers
3. Budget risk warnings
4. Cashflow health
5. One concrete improvement suggestion
`;

    const completion = await openai.chat.completions.create({
      model:
        process.env.OPENAI_MODEL ||
        process.env.OPENROUTER_MODEL ||
        "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 700,
    });

    return completion.choices[0].message.content;
  }

  return {
    analyzeSpending,
    calculateSavingsRate,
  };
}

module.exports = createAnalysisService;
