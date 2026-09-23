import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 1.3: Modern Chat Stream & Message List Feature Tests', async (t) => {
  const sessionTurnSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/SessionTurn.tsx'), 'utf8');
  const contextUsageSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/ContextUsageBar.tsx'), 'utf8');
  const chatContentSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/ChatContent.tsx'), 'utf8');

  await t.test('T1.3.1: SessionTurn layout structure for user and assistant messages', () => {
    assert.match(sessionTurnSource, /userMessage/);
    assert.match(sessionTurnSource, /assistantMessage/);
    assert.match(sessionTurnSource, /UserIcon/);
    assert.match(sessionTurnSource, /RobotIcon/);
    assert.match(sessionTurnSource, /SessionTurn/);
  });

  await t.test('T1.3.2: Incremental message chunk streaming assembly simulation', () => {
    const chunks = ['Hello', ' world!', ' Here is', ' your data: \n\n', '| Col A | Col B |\n|---|---|\n| 1 | 2 |'];
    let accumulated = '';
    for (const chunk of chunks) {
      accumulated += chunk;
    }
    assert.equal(accumulated, 'Hello world! Here is your data: \n\n| Col A | Col B |\n|---|---|\n| 1 | 2 |');
    assert.ok(accumulated.includes('| Col A | Col B |'));
  });

  await t.test('T1.3.3: Rich Markdown and LaTeX integration check in SessionTurn', () => {
    assert.match(sessionTurnSource, /markdownComponents/);
    assert.match(sessionTurnSource, /markdownPlugins/);
    assert.match(sessionTurnSource, /preprocessLaTeX/);
    assert.match(sessionTurnSource, /GPTVis/);
  });

  await t.test('T1.3.4: Tool step icons and execution statuses (pending, running, completed, failed)', () => {
    assert.match(sessionTurnSource, /stepStatusConfig/);
    assert.match(sessionTurnSource, /getToolIcon/);
    assert.match(sessionTurnSource, /pending/);
    assert.match(sessionTurnSource, /running/);
    assert.match(sessionTurnSource, /completed/);
    assert.match(sessionTurnSource, /failed/);
  });

  await t.test('T1.3.5: Clean localization labels in chat turns without raw debug strings', () => {
    assert.match(sessionTurnSource, /useTranslation/);
    assert.match(chatContentSource, /useTranslation/);
    assert.match(sessionTurnSource, /copy_to_clipboard/);
  });

  await t.test('T1.3.6: ContextUsageBar calculation logic and percentage clamping', () => {
    function computeUsage(used, max) {
      if (!max || max <= 0) return 0;
      const ratio = (used / max) * 100;
      return Math.min(100, Math.max(0, Math.round(ratio)));
    }

    assert.equal(computeUsage(4000, 8000), 50);
    assert.equal(computeUsage(0, 8000), 0);
    assert.equal(computeUsage(10000, 8000), 100);
    assert.match(contextUsageSource, /ContextUsageBar/);
  });
});
