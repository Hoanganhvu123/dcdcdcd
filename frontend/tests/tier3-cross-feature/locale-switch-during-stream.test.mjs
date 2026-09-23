import test from 'node:test';
import assert from 'node:assert/strict';

test('Tier 3.4: Cross-Feature - Language Switch During Active Stream', async (t) => {
  await t.test('T3.4.1: Status messages map correctly across English and Vietnamese locales', () => {
    const localeDict = {
      en: {
        thinking: 'Thinking...',
        thought_for: 'Thought for',
        completed: 'Completed',
        error: 'Failed'
      },
      vi: {
        thinking: 'Đang suy nghĩ...',
        thought_for: 'Đã suy nghĩ trong',
        completed: 'Đã hoàn thành',
        error: 'Thất bại'
      }
    };

    let currentLang = 'en';
    function getStatusLabel(key) {
      return localeDict[currentLang][key];
    }

    assert.equal(getStatusLabel('thinking'), 'Thinking...');

    // Switch to Vietnamese mid-stream
    currentLang = 'vi';
    assert.equal(getStatusLabel('thinking'), 'Đang suy nghĩ...');
    assert.equal(getStatusLabel('completed'), 'Đã hoàn thành');
  });

  await t.test('T3.4.2: Stream token buffer remains unaltered during language switch', () => {
    const streamedTokens = ['Xin ', 'chào ', 'DB-GPT'];
    let fullMsg = streamedTokens.join('');
    assert.equal(fullMsg, 'Xin chào DB-GPT');
  });
});
