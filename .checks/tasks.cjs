const prices = {
  'claude-opus-4-5': [15, 75, 18.75, 1.5],
  'claude-sonnet-4-5': [3, 15, 3.75, .3],
  'claude-haiku-4-5': [.8, 4, 1, .08],
  'claude-3-opus': [15, 75, 18.75, 1.5],
  'claude-3-5-sonnet': [3, 15, 3.75, .3],
  'claude-3-5-haiku': [.8, 4, 1, .08],
  'gpt-4o': [2.5, 10, 0, 1.25],
  'gpt-4o-mini': [.15, .6, 0, .075],
  'gpt-4.1': [2, 8, 0, .5],
  'o3': [10, 40, 0, 2.5],
  'o4-mini': [1.1, 4.4, 0, .275],
  'gemini-1.5-pro': [1.25, 5, 0, 0],
  'gemini-2.0-flash': [.1, .4, 0, 0],
};

function dollars(nanos) {
  if (nanos < 100000n) return '< $0.0001';
  const units = (nanos + 50000n) / 100000n;
  return '$' + (units / 10000n) + '.' + String(units % 10000n).padStart(4, '0');
}

function costTracker(input) {
  if (!input.artifact_exists || !input.token_usage?.length) return { actions: [], totals: null };
  const models = new Map();
  const fields = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
  for (const row of input.token_usage) {
    const model = row.model;
    if (!models.has(model)) models.set(model, { tokens: [0, 0, 0, 0], nanos: 0n });
    const aggregate = models.get(model);
    const rates = prices[model] || [3, 15, 0, 0];
    fields.forEach((field, index) => {
      const count = row[field] || 0;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid token count');
      aggregate.tokens[index] += count;
      aggregate.nanos += BigInt(count) * BigInt(Math.round(rates[index] * 1000));
    });
  }
  let total = 0n;
  const table = [];
  for (const [model, row] of models) {
    total += row.nanos;
    table.push(`| ${model} | ${row.tokens.join(' | ')} | ${dollars(row.nanos)} |`);
  }
  const amount = dollars(total), run = input.run;
  const body = `## Agent run cost\n\n| | |\n|---|---|\n| **Workflow** | ${run.number} |\n| **Run** | [#${run.run_number}](${run.html_url}) |\n| **Conclusion** | ${run.conclusion} |\n| **Total cost** | ${amount} |\n\n<details>\n<summary>Token breakdown by model</summary>\n\n| Model | Input | Output | Cache write | Cache read | Cost |\n|-------|------:|-------:|------------:|-----------:|-----:|\n${table.join('\n')}\n\n</details>\n\n*Data from [token-usage.jsonl](https://github.github.com/gh-aw/reference/token-usage/) written by gh-aw's firewall.*`;
  const actions = run.pull_requests?.length
    ? [{ kind: 'add_comment', issue: run.pull_requests[0].number, body }]
    : [{ kind: 'create_issue', title: `[cost-tracker] ${run.number} #${run.run_number}: ${amount}`, labels: ['automation', 'cost'], body }];
  if (total > 1000000000n && input.alerts_enabled !== false) {
    actions.push({ kind: 'create_issue', title: `[cost-tracker] High spend alert: ${amount} for ${run.number}`, labels: ['automation', 'cost'], body });
  }
  return { actions, totals: { nanos: String(total), formatted: amount, models: models.size } };
}


module.exports = { costTracker };
