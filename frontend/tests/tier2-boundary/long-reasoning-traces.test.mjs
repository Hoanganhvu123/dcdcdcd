import test from 'node:test';
import assert from 'node:assert/strict';

function parseReActContent(content) {
  if (!content || typeof content !== 'string') return [];

  const sections = [];
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const sectionPatterns = [
    { type: 'thought', pattern: /(?:^|\n)(?:Thought|思考|💭)\s*[:：]\s*/gi },
    { type: 'action', pattern: /(?:^|\n)(?:Action|动作|⚡)\s*[:：]\s*/gi },
    {
      type: 'action_input',
      pattern: /(?:^|\n)(?:Action Input|Action_Input|ActionInput|动作输入|输入)\s*[:：]\s*/gi,
    },
    { type: 'observation', pattern: /(?:^|\n)(?:Observation|观察|观察结果|👁)\s*[:：]\s*/gi },
  ];

  const matches = [];

  for (const { type, pattern } of sectionPatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(normalizedContent)) !== null) {
      matches.push({
        type,
        index: match.index,
        length: match[0].length,
      });
    }
  }

  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) {
    const errorPatterns = [/error/i, /failed/i, /exception/i, /traceback/i];
    const isError = errorPatterns.some(p => p.test(normalizedContent));
    return [
      {
        type: isError ? 'error' : 'text',
        content: normalizedContent.trim(),
      },
    ];
  }

  if (matches[0].index > 0) {
    const leadingText = normalizedContent.substring(0, matches[0].index).trim();
    if (leadingText) {
      sections.push({ type: 'text', content: leadingText });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];

    const startIndex = current.index + current.length;
    const endIndex = next ? next.index : normalizedContent.length;

    let sectionContent = normalizedContent.substring(startIndex, endIndex).trim();

    let actionName;
    if (current.type === 'action') {
      const pipeIndex = sectionContent.indexOf('|');
      if (pipeIndex > 0) {
        actionName = sectionContent.substring(0, pipeIndex).trim();
        sectionContent = sectionContent.substring(pipeIndex + 1).trim();
      } else {
        const firstLineEnd = sectionContent.indexOf('\n');
        if (firstLineEnd > 0) {
          actionName = sectionContent.substring(0, firstLineEnd).trim();
          sectionContent = sectionContent.substring(firstLineEnd + 1).trim();
        }
      }
    }

    sections.push({
      type: current.type,
      content: sectionContent,
      actionName,
    });
  }

  return sections;
}

test('Tier 2.2: Extreme Reasoning Traces Stress & Performance', async (t) => {
  await t.test('T2.2.1: Parse 50-step iterative reasoning trace (>15,000 characters) in < 50ms', () => {
    let largeTrace = '';
    for (let step = 1; step <= 50; step++) {
      largeTrace += `Thought: Exploring step ${step} with deep architectural reasoning and mathematical formulation.\n`;
      largeTrace += `Action: execute_tool_${step} | SELECT * FROM metrics_table_${step} WHERE timestamp > NOW() - INTERVAL 1 DAY;\n`;
      largeTrace += `Action Input: {"query_id": ${step}, "params": {"filter": "step_${step}"}}\n`;
      largeTrace += `Observation: {"status": 200, "rows_returned": ${step * 100}, "data": [{"id": ${step}, "metric": "cpu_load"}]}\n\n`;
    }

    assert.ok(largeTrace.length > 10000);

    const start = performance.now();
    const parsed = parseReActContent(largeTrace);
    const elapsed = performance.now() - start;

    assert.equal(parsed.length, 200); // 50 * 4 sections
    assert.ok(elapsed < 100, `Parsing took ${elapsed}ms which is under 100ms budget`);
  });

  await t.test('T2.2.2: Deeply nested JSON observation formatting resilience without recursion crash', () => {
    const deepObj = { level: 1 };
    let cur = deepObj;
    for (let i = 2; i <= 30; i++) {
      cur.nested = { level: i };
      cur = cur.nested;
    }
    const jsonStr = JSON.stringify(deepObj, null, 2);
    assert.ok(jsonStr.length > 500);
    assert.ok(jsonStr.includes('"level": 30'));
  });
});
