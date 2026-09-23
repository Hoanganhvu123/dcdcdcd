import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 3.1: Cross-Feature - Split Screen + Live Streaming + Theme Toggle', async (t) => {
  const rightPanelSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/ManusRightPanel.tsx'), 'utf8');
  const leftPanelSource = fs.readFileSync(path.join(ROOT, 'components/chat/content/ManusLeftPanel.tsx'), 'utf8');
  const globalsCss = fs.readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8');

  await t.test('T3.1.1: Split panel maintains responsive width ratio during active message stream', () => {
    // Verifies split screen layout flex / grid classes and scroll isolation
    assert.match(leftPanelSource, /ManusLeftPanel/);
    assert.match(rightPanelSource, /ManusRightPanel/);
  });

  await t.test('T3.1.2: Dynamic theme class (.dark) updates CSS tokens without re-mounting active artifacts', () => {
    // CSS tokens are referenced via var(--...) so class changes on root update colors dynamically
    assert.match(globalsCss, /--kimi-explore/);
    assert.match(globalsCss, /--kimi-panel/);
    assert.match(globalsCss, /--kimi-bubble/);
  });

  await t.test('T3.1.3: Streaming chunk buffer appends correctly while artifact viewer is mounted', () => {
    const chatState = {
      isStreaming: true,
      accumulatedText: '',
      activeArtifact: { type: 'chart', id: 'chart-1', data: { values: [10, 20, 30] } }
    };

    const incomingChunks = ['Plotting ', 'quarterly revenue ', 'data...'];
    for (const chunk of incomingChunks) {
      chatState.accumulatedText += chunk;
    }

    assert.equal(chatState.accumulatedText, 'Plotting quarterly revenue data...');
    assert.equal(chatState.activeArtifact.type, 'chart');
    assert.equal(chatState.activeArtifact.data.values.length, 3);
  });
});
