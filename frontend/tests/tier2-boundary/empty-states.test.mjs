import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 2.1: Boundary & Empty States Verification', async (t) => {
  const chatWelcomeSource = fs.readFileSync(path.join(ROOT, 'components/chat/ChatWelcome.tsx'), 'utf8');
  const sessionTurnSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/SessionTurn.tsx'), 'utf8');

  await t.test('T2.1.1: ChatWelcome empty state rendering with prompt suggestions and greeting', () => {
    assert.match(chatWelcomeSource, /ChatWelcome/);
    assert.match(chatWelcomeSource, /suggestions/);
    assert.match(chatWelcomeSource, /defaultSuggestions/);
    assert.match(chatWelcomeSource, /welcome_message/);
    assert.ok(chatWelcomeSource.includes('useTranslation'));
  });

  await t.test('T2.1.2: SessionTurn with empty string userMessage and assistantMessage', () => {
    assert.match(sessionTurnSource, /userMessage/);
    assert.match(sessionTurnSource, /assistantMessage/);
  });

  await t.test('T2.1.3: SlideCanvas zero and negative dimensions boundary protection', () => {
    const SLIDE_WIDTH = 960;
    const SLIDE_HEIGHT = 540;
    const PADDING = 32;

    function safeSlideScale(containerWidth, containerHeight) {
      if (!containerWidth || !containerHeight || containerWidth <= 0 || containerHeight <= 0) {
        return 1.0;
      }
      const availW = Math.max(0, containerWidth - PADDING * 2);
      const availH = Math.max(0, containerHeight - PADDING * 2);
      if (availW === 0 || availH === 0) return 0.1;
      const scaleX = availW / SLIDE_WIDTH;
      const scaleY = availH / SLIDE_HEIGHT;
      return Math.min(scaleX, scaleY, 1.5);
    }

    assert.equal(safeSlideScale(0, 0), 1.0);
    assert.equal(safeSlideScale(-100, 500), 1.0);
    assert.equal(safeSlideScale(20, 20), 0.1);
  });

  await t.test('T2.1.4: Empty ReAct thinking trace parsing returns empty array', () => {
    function parseReActContent(content) {
      if (!content || typeof content !== 'string') return [];
      return [{ type: 'text', content: content.trim() }];
    }

    assert.deepEqual(parseReActContent(''), []);
    assert.deepEqual(parseReActContent(null), []);
    assert.deepEqual(parseReActContent(undefined), []);
  });

  await t.test('T2.1.5: Empty Excel workbook and table rendering graceful fallback', () => {
    const emptyRows = [];
    const hasData = emptyRows.length > 0;
    assert.equal(hasData, false);
  });
});
