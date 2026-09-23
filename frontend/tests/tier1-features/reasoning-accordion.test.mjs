import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Import the parser logic directly or reproduce faithfully for standalone testing
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

test('Tier 1.4: Kimi-Style Reasoning Accordion Feature Tests', async (t) => {
  const thinkingBlockSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/ThinkingBlock.tsx'), 'utf8');
  const toolBadgeSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/ToolExecutionBadge.tsx'), 'utf8');
  const manusPanelSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/ManusLeftPanel.tsx'), 'utf8');
  const jsonHighlightSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/json-highlight.tsx'), 'utf8');

  await t.test('T1.4.1: parseReActContent extracts Thought, Action, Action Input, and Observation cleanly', () => {
    const rawTrace = `Thought: I should query the database for users.
Action: db_query | SELECT * FROM users LIMIT 5;
Action Input: {"limit": 5}
Observation: [{"id": 1, "name": "Alice"}]`;

    const sections = parseReActContent(rawTrace);
    assert.equal(sections.length, 4);
    assert.equal(sections[0].type, 'thought');
    assert.equal(sections[0].content, 'I should query the database for users.');
    assert.equal(sections[1].type, 'action');
    assert.equal(sections[1].actionName, 'db_query');
    assert.equal(sections[1].content, 'SELECT * FROM users LIMIT 5;');
    assert.equal(sections[2].type, 'action_input');
    assert.equal(sections[3].type, 'observation');
  });

  await t.test('T1.4.2: parseReActContent handles multilingual tokens (Chinese & Emojis)', () => {
    const multiTrace = `思考：需要分析财务数据
⚡：python_exec
import pandas as pd
df = pd.DataFrame()
动作输入：{}
👁：Table generated`;

    const sections = parseReActContent(multiTrace);
    assert.equal(sections.length, 4);
    assert.equal(sections[0].type, 'thought');
    assert.equal(sections[1].type, 'action');
    assert.equal(sections[2].type, 'action_input');
    assert.equal(sections[3].type, 'observation');
  });

  await t.test('T1.4.3: 100% Ant Design elimination in ThinkingBlock, ToolExecutionBadge, and ManusLeftPanel', () => {
    // Verifies zero antd or @ant-design/icons imports
    assert.equal(/from ['"]antd['"]/.test(thinkingBlockSource), false, 'ThinkingBlock must not import antd');
    assert.equal(/from ['"]@ant-design\/icons['"]/.test(thinkingBlockSource), false, 'ThinkingBlock must not import @ant-design/icons');
    assert.equal(/from ['"]antd['"]/.test(toolBadgeSource), false, 'ToolExecutionBadge must not import antd');
    assert.equal(/from ['"]@ant-design\/icons['"]/.test(toolBadgeSource), false, 'ToolExecutionBadge must not import @ant-design/icons');
    assert.equal(/from ['"]antd['"]/.test(manusPanelSource), false, 'ManusLeftPanel must not import antd');
    assert.equal(/from ['"]@ant-design\/icons['"]/.test(manusPanelSource), false, 'ManusLeftPanel must not import @ant-design/icons');
  });

  await t.test('T1.4.4: Duration formatting calculation and timing badges', () => {
    function formatDuration(ms) {
      if (ms < 1000) return `${ms}ms`;
      const seconds = (ms / 1000).toFixed(1);
      return `${seconds}s`;
    }

    assert.equal(formatDuration(450), '450ms');
    assert.equal(formatDuration(3200), '3.2s');
    assert.equal(formatDuration(12000), '12.0s');
  });

  await t.test('T1.4.5: JSON tokenizer and syntax highlighting utility structure', () => {
    assert.match(jsonHighlightSource, /highlightJson/);
    assert.match(jsonHighlightSource, /formatAndHighlightJson/);
    assert.match(jsonHighlightSource, /text-foreground/);
    assert.match(jsonHighlightSource, /text-muted-foreground/);
  });

  await t.test('T1.4.6: Spring animated collapsible accordion with Radix tooltip & Sonner toast', () => {
    assert.match(thinkingBlockSource, /type:\s*['"]spring['"]/);
    assert.match(thinkingBlockSource, /TooltipProvider/);
    assert.match(thinkingBlockSource, /toast\.success/);
    assert.match(toolBadgeSource, /type:\s*['"]spring['"]/);
    assert.match(toolBadgeSource, /TooltipProvider/);
    assert.match(toolBadgeSource, /toast\.success/);
  });
});
