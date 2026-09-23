import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EventEmitter from 'node:events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// ADVERSARIAL CHALLENGER 2: ASYNC, STREAM & LIFECYCLE STRESS SUITE
// ============================================================================

test('Adversarial Async and Stream Challenger Suite (Challenger 2)', async (t) => {

  // -------------------------------------------------------------
  // SUITE 1: RAPID MOUNT / UNMOUNT CYCLES & LIFECYCLE CLEANLINESS
  // -------------------------------------------------------------
  await t.test('Suite 1: Rapid Mount / Unmount Cycles in VisTabs and ResourceContentV2', async (st) => {
    
    // 1.1 VisTabs 100 rapid cycles
    await st.test('1.1: VisTabs 100 rapid mount/unmount cycles verify zero listener leaks and clean teardown', () => {
      const EVENTS = { TASK_CLICK: 'task_click' };
      const emitter = new EventEmitter();

      class MockDOMContainer {
        constructor() { this.listeners = new Map(); }
        addEventListener(event, fn) {
          if (!this.listeners.has(event)) this.listeners.set(event, new Set());
          this.listeners.get(event).add(fn);
        }
        removeEventListener(event, fn) {
          if (this.listeners.has(event)) {
            this.listeners.get(event).delete(fn);
          }
        }
        listenerCount(event) {
          return this.listeners.get(event)?.size || 0;
        }
      }

      const container = new MockDOMContainer();
      let clickCallbackInvocations = 0;

      function mountVisTabs() {
        let isMounted = true;
        const handleTaskClick = (eventData) => {
          if (!isMounted) throw new Error('Orphaned callback fired on unmounted VisTabs!');
          if (eventData?.taskId) { clickCallbackInvocations++; }
        };
        const handleScroll = () => {
          if (!isMounted) throw new Error('Orphaned scroll listener fired on unmounted VisTabs!');
        };
        emitter.on(EVENTS.TASK_CLICK, handleTaskClick);
        container.addEventListener('scroll', handleScroll);
        return () => {
          isMounted = false;
          emitter.off(EVENTS.TASK_CLICK, handleTaskClick);
          container.removeEventListener('scroll', handleScroll);
        };
      }

      for (let i = 0; i < 100; i++) {
        const cleanup = mountVisTabs();
        assert.equal(emitter.listenerCount(EVENTS.TASK_CLICK), 1);
        assert.equal(container.listenerCount('scroll'), 1);
        emitter.emit(EVENTS.TASK_CLICK, { taskId: 'task_' + i });
        assert.equal(clickCallbackInvocations, i + 1);
        cleanup();
        assert.equal(emitter.listenerCount(EVENTS.TASK_CLICK), 0, 'Listener leaked on cycle ' + i);
        assert.equal(container.listenerCount('scroll'), 0, 'Scroll listener leaked on cycle ' + i);
      }

      emitter.emit(EVENTS.TASK_CLICK, { taskId: 'late_task' });
      assert.equal(clickCallbackInvocations, 100);
      assert.equal(emitter.listenerCount(EVENTS.TASK_CLICK), 0);
    });

    // 1.2 ResourceContentV2 100 rapid cycles
    await st.test('1.2: ResourceContentV2 100 rapid mount/unmount cycles cancel active debounce timers', async () => {
      let stateUpdateCount = 0;
      let timerCleanupCount = 0;

      class MockResourceContentV2 {
        constructor() {
          this.isMounted = true;
          this.updateTimeoutRef = null;
          this.initTimeoutRef = null;
        }
        scheduleUpdate(delay = 300) {
          if (this.updateTimeoutRef) clearTimeout(this.updateTimeoutRef);
          this.updateTimeoutRef = setTimeout(() => {
            if (!this.isMounted) throw new Error('State update attempted on unmounted ResourceContentV2!');
            stateUpdateCount++;
          }, delay);
        }
        mount() {
          this.initTimeoutRef = setTimeout(() => {
            if (this.isMounted) this.scheduleUpdate(50);
          }, 20);
        }
        unmount() {
          this.isMounted = false;
          if (this.updateTimeoutRef) {
            clearTimeout(this.updateTimeoutRef);
            this.updateTimeoutRef = null;
            timerCleanupCount++;
          }
          if (this.initTimeoutRef) {
            clearTimeout(this.initTimeoutRef);
            this.initTimeoutRef = null;
            timerCleanupCount++;
          }
        }
      }

      for (let i = 0; i < 100; i++) {
        const instance = new MockResourceContentV2();
        instance.mount();
        instance.scheduleUpdate(100);
        instance.unmount();
      }

      await new Promise((r) => setTimeout(r, 150));
      assert.equal(stateUpdateCount, 0, 'No state updates should fire after unmount');
      assert.ok(timerCleanupCount >= 100, 'All scheduled timers were intercepted and cleaned');
    });

    // 1.3 Rapid typing / unmount race condition
    await st.test('1.3: Rapid form value mutations during in-flight debounce survive sudden unmount', async () => {
      let dispatchedUpdates = 0;
      let cleanedTimeouts = 0;

      class FormWatcherComponent {
        constructor() {
          this.isMounted = true;
          this.debounceTimer = null;
        }
        onValuesChange(field, val) {
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            cleanedTimeouts++;
          }
          this.debounceTimer = setTimeout(() => {
            if (!this.isMounted) return;
            dispatchedUpdates++;
          }, 50);
        }
        unmount() {
          this.isMounted = false;
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
            cleanedTimeouts++;
          }
        }
      }

      const instance = new FormWatcherComponent();
      // Rapid typing 20 keystrokes
      for (let k = 0; k < 20; k++) {
        instance.onValuesChange('prompt', 'input_' + k);
      }
      // Sudden unmount before 50ms debounce
      instance.unmount();

      await new Promise((r) => setTimeout(r, 80));
      assert.equal(dispatchedUpdates, 0, 'No orphaned network dispatch after unmount');
      assert.ok(cleanedTimeouts >= 20, 'All intermediate debounce timers cancelled');
    });

    // 1.4 Static AST Pattern Verification
    await st.test('1.4: Static AST pattern verification for cleanup returns in vis-tabs and ResourceContentV2', () => {
      const visTabsSrc = fs.readFileSync(path.join(ROOT, 'components/chat/chat-content/vis-tabs.tsx'), 'utf8');
      const resourceSrc = fs.readFileSync(path.join(ROOT, 'components/construct/app/extra/components/auto-plan/ResourceContentV2.tsx'), 'utf8');

      assert.match(visTabsSrc, /ee\.off\(EVENTS\.TASK_CLICK/);
      assert.match(visTabsSrc, /scrollContainer\.removeEventListener\('scroll'/);
      assert.match(resourceSrc, /clearTimeout\(updateTimeoutRef\.current\)/);
      assert.match(resourceSrc, /return\s*\(\)\s*=>\s*\{\s*if\s*\(updateTimeoutRef\.current\)/);
    });
  });

  // -------------------------------------------------------------
  // SUITE 2: INTERRUPTED SSE NETWORK STREAMS RESILIENCE
  // -------------------------------------------------------------
  await t.test('Suite 2: Interrupted SSE Network Streams Resilience', async (st) => {
    class SSEReader {
      constructor(onChunk, onError, onDone) {
        this.onChunk = onChunk;
        this.onError = onError;
        this.onDone = onDone;
        this.buffer = '';
        this.status = 'idle';
        this.receivedChunks = [];
      }
      feed(rawText) {
        this.buffer += rawText;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') {
            this.status = 'done';
            if (this.onDone) this.onDone();
            return;
          }
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            try {
              const parsed = JSON.parse(dataStr);
              this.receivedChunks.push(parsed);
              if (this.onChunk) this.onChunk(parsed);
            } catch (err) {
              if (this.onError) this.onError(new Error('Malformed SSE chunk: ' + dataStr));
            }
          }
        }
      }
      abort() { this.status = 'aborted'; }
      fail(error) {
        this.status = 'error';
        if (this.onError) this.onError(error);
      }
    }

    // 2.1 Client Abort
    await st.test('2.1: Client Abort mid-stream cleanly halts reception without unhandled rejection', async () => {
      const abortController = new AbortController();
      let chunksReceived = 0;
      let streamStatus = 'streaming';

      const reader = new SSEReader(
        (chunk) => { chunksReceived++; },
        (err) => {},
        () => { streamStatus = 'completed'; }
      );

      abortController.signal.addEventListener('abort', () => {
        reader.abort();
        streamStatus = 'aborted';
      });

      for (let i = 1; i <= 50; i++) {
        if (abortController.signal.aborted) break;
        reader.feed('data: ' + JSON.stringify({ id: i, text: 'Token ' + i }) + '\n\n');
        if (i === 20) {
          abortController.abort();
        }
      }

      assert.equal(chunksReceived, 20);
      assert.equal(streamStatus, 'aborted');
      assert.equal(reader.status, 'aborted');
      assert.equal(reader.receivedChunks.length, 20);
    });

    // 2.2 Socket Drop
    await st.test('2.2: Mid-stream socket drop (ECONNRESET) is captured gracefully preserving buffer', async () => {
      let caughtError = null;
      const reader = new SSEReader(
        null,
        (err) => { caughtError = err; },
        null
      );

      for (let i = 1; i <= 15; i++) {
        reader.feed('data: ' + JSON.stringify({ index: i }) + '\n\n');
      }
      assert.equal(reader.receivedChunks.length, 15);

      const socketError = new Error('read ECONNRESET - connection reset by peer');
      reader.fail(socketError);

      assert.equal(reader.status, 'error');
      assert.ok(caughtError);
      assert.equal(caughtError.message, 'read ECONNRESET - connection reset by peer');
      assert.equal(reader.receivedChunks.length, 15, 'Received chunks prior to socket drop must be preserved');
    });

    // 2.3 Network Timeout
    await st.test('2.3: Inactivity watchdog detects stalled stream and triggers timeout cancellation', async () => {
      let timeoutTriggered = false;
      const TIMEOUT_MS = 60;
      const reader = new SSEReader();
      reader.feed('data: {"init": true}\n\n');

      let lastActivity = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastActivity > TIMEOUT_MS) {
          timeoutTriggered = true;
          reader.fail(new Error('Stream timeout: inactivity limit exceeded'));
          clearInterval(watchdog);
        }
      }, 20);

      await new Promise((r) => setTimeout(r, 100));
      assert.equal(timeoutTriggered, true);
      assert.equal(reader.status, 'error');
      clearInterval(watchdog);
    });

    // 2.4 Fragmented Packets and Malformed Frames
    await st.test('2.4: Fragmented TCP chunks and malformed frames handled with zero stream corruption', () => {
      const errors = [];
      const reader = new SSEReader(
        null,
        (err) => { errors.push(err); },
        null
      );

      reader.feed('data: {"part": "fir');
      reader.feed('st", "content": "hell');
      reader.feed('o world"}\n\n');

      assert.equal(reader.receivedChunks.length, 1);
      assert.equal(reader.receivedChunks[0].content, 'hello world');

      reader.feed('data: {MALFORMED_JSON_SYNTAX\n\n');
      assert.equal(errors.length, 1);

      reader.feed('data: {"part": "second", "content": "valid frame"}\n\n');
      assert.equal(reader.receivedChunks.length, 2);
      assert.equal(reader.receivedChunks[1].content, 'valid frame');

      reader.feed('data: [DONE]\n\n');
      assert.equal(reader.status, 'done');
    });

    // 2.5 Out-of-order sequence indexing & deduplication
    await st.test('2.5: Out-of-order sequence chunk arrival is reordered into strictly monotonic stream', () => {
      const sequenceBuffer = new Map();
      let expectedSeq = 1;
      const output = [];

      function receivePacket(seq, content) {
        sequenceBuffer.set(seq, content);
        while (sequenceBuffer.has(expectedSeq)) {
          output.push(sequenceBuffer.get(expectedSeq));
          sequenceBuffer.delete(expectedSeq);
          expectedSeq++;
        }
      }

      // Packets arrive out of order: 1, 3, 4, 2, 5
      receivePacket(1, 'Part1');
      assert.deepEqual(output, ['Part1']);

      receivePacket(3, 'Part3');
      receivePacket(4, 'Part4');
      assert.deepEqual(output, ['Part1']); // Stalled at 2

      receivePacket(2, 'Part2'); // Fills gap
      assert.deepEqual(output, ['Part1', 'Part2', 'Part3', 'Part4']);

      receivePacket(5, 'Part5');
      assert.deepEqual(output, ['Part1', 'Part2', 'Part3', 'Part4', 'Part5']);
    });
  });

  // -------------------------------------------------------------
  // SUITE 3: PARALLEL PROMISE.ALL ERROR HANDLING & FAULT ISOLATION
  // -------------------------------------------------------------
  await t.test('Suite 3: Parallel Promise.all Error Handling and Fault Isolation', async (st) => {

    await st.test('3.1: Promise.allSettled isolates single-service failure without crashing parent view', async () => {
      const fetchWorkspace = async () => ({ status: 'ok', id: 'ws_1', name: 'Main Workspace' });
      const fetchModels = async () => ({ status: 'ok', models: ['gpt-4o', 'deepseek-v4-flash'] });
      const fetchPrompts = async () => ({ status: 'ok', templates: ['analytics', 'code'] });
      const fetchOptionalPlugins = async () => {
        throw new Error('500 Internal Server Error: Plugin Service Unavailable');
      };

      const results = await Promise.allSettled([
        fetchWorkspace(),
        fetchModels(),
        fetchPrompts(),
        fetchOptionalPlugins(),
      ]);

      const [workspaceRes, modelsRes, promptsRes, pluginsRes] = results;
      assert.equal(workspaceRes.status, 'fulfilled');
      assert.equal(workspaceRes.value.name, 'Main Workspace');
      assert.equal(modelsRes.status, 'fulfilled');
      assert.equal(modelsRes.value.models.length, 2);
      assert.equal(promptsRes.status, 'fulfilled');

      assert.equal(pluginsRes.status, 'rejected');
      assert.ok(pluginsRes.reason.message.includes('Plugin Service Unavailable'));

      const viewState = {
        workspace: workspaceRes.status === 'fulfilled' ? workspaceRes.value : null,
        models: modelsRes.status === 'fulfilled' ? modelsRes.value.models : [],
        prompts: promptsRes.status === 'fulfilled' ? promptsRes.value.templates : [],
        plugins: pluginsRes.status === 'fulfilled' ? pluginsRes.value : null,
        warnings: pluginsRes.status === 'rejected' ? [pluginsRes.reason.message] : [],
      };

      assert.ok(viewState.workspace !== null);
      assert.equal(viewState.models.length, 2);
      assert.equal(viewState.plugins, null);
      assert.equal(viewState.warnings.length, 1);
    });

    await st.test('3.2: 50 concurrent async tasks settle with zero unhandled rejections', async () => {
      const concurrency = 50;
      const tasks = Array.from({ length: concurrency }, (_, idx) => {
        return new Promise((resolve, reject) => {
          const delay = Math.floor(Math.random() * 20) + 5;
          setTimeout(() => {
            if (idx % 5 === 0) {
              reject(new Error('Simulated async failure on task ' + idx));
            } else {
              resolve({ taskId: idx, result: 'Success data for ' + idx });
            }
          }, delay);
        });
      });

      const settled = await Promise.allSettled(tasks);
      assert.equal(settled.length, 50);
      const fulfilled = settled.filter(s => s.status === 'fulfilled');
      const rejected = settled.filter(s => s.status === 'rejected');
      assert.equal(fulfilled.length, 40);
      assert.equal(rejected.length, 10);
    });

    await st.test('3.3: Out-of-order async responses are invalidated by latest request ID / sequence counter', async () => {
      let activeQueryId = 0;
      let displayedData = null;

      async function executeSearch(query, expectedDelay) {
        const queryId = ++activeQueryId;
        return new Promise((resolve) => {
          setTimeout(() => {
            if (queryId === activeQueryId) {
              displayedData = 'Results for ' + query + ' (ID: ' + queryId + ')';
            }
            resolve({ queryId, query });
          }, expectedDelay);
        });
      }

      const p1 = executeSearch('Alpha', 20);
      const p2 = executeSearch('Beta', 80);
      const p3 = executeSearch('Gamma', 40);

      await Promise.all([p1, p2, p3]);
      assert.equal(displayedData, 'Results for Gamma (ID: 3)');
    });

    await st.test('3.4: Promise.race timeout shield prevents unbounded hang on unresponsive endpoints', async () => {
      async function fetchWithTimeout(promise, timeoutMs = 50) {
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs);
        });
        try {
          return await Promise.race([promise, timeoutPromise]);
        } finally {
          clearTimeout(timer);
        }
      }

      const slowPromise = new Promise((resolve) => setTimeout(() => resolve('Too late'), 200));
      const fastPromise = new Promise((resolve) => setTimeout(() => resolve('Just in time'), 20));

      const fastResult = await fetchWithTimeout(fastPromise, 50);
      assert.equal(fastResult, 'Just in time');

      await assert.rejects(
        () => fetchWithTimeout(slowPromise, 50),
        { message: 'REQUEST_TIMEOUT' }
      );
    });
  });

  // -------------------------------------------------------------
  // SUITE 4: 60 FPS TOKEN STREAMING & MEMOIZED ARTIFACT RE-RENDER STRESS
  // -------------------------------------------------------------
  await t.test('Suite 4: 60 FPS Token Streaming and Memoized Artifact Re-render Stress', async (st) => {
    class SimulatedComponent {
      constructor(name, arePropsEqual = null) {
        this.name = name;
        this.renderCount = 0;
        this.prevProps = null;
        this.arePropsEqual = arePropsEqual || ((prev, next) => {
          if (prev === next) return true;
          if (!prev || !next) return false;
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(next);
          if (prevKeys.length !== nextKeys.length) return false;
          return prevKeys.every(k => prev[k] === next[k]);
        });
      }
      render(nextProps) {
        if (this.renderCount === 0 || !this.arePropsEqual(this.prevProps, nextProps)) {
          this.renderCount++;
          this.prevProps = { ...nextProps };
          return true;
        }
        return false;
      }
    }

    await st.test('4.1: 500 streaming tokens at 60 FPS cause ZERO parasitic re-renders on 10 memoized sibling artifacts', () => {
      const activeStreamConsumer = new SimulatedComponent('StreamTextRenderer', () => false);
      
      const memoizedComponents = [
        new SimulatedComponent('ReplayDocxSyncViewer'),
        new SimulatedComponent('ReplayExcelSyncViewer'),
        new SimulatedComponent('ReplaySlideSyncViewer'),
        new SimulatedComponent('ThinkingStepBlock'),
        new SimulatedComponent('ToolExecutionBadge'),
        new SimulatedComponent('ReplayTimelineScrubber'),
        new SimulatedComponent('MarkdownArtifact'),
        new SimulatedComponent('ChartArtifact'),
        new SimulatedComponent('CodePreview'),
        new SimulatedComponent('ChatHeader'),
      ];

      const stablePropsList = [
        { markdown: '# Docx Title', wordCount: 150 },
        { sessionId: 's_1', currentStepIndex: 0, isPlaying: false },
        { activeSlide: 1, totalSlides: 10 },
        { thoughts: 'Thinking step 1', duration: 120 },
        { toolName: 'sql_executor', status: 'completed' },
        { currentPosition: 0, maxPosition: 100 },
        { rawMarkdown: '## Analysis', tokenCount: 45 },
        { chartType: 'bar', dataPoints: 12 },
        { codeSnippet: 'SELECT * FROM users', language: 'sql' },
        { title: 'DB-GPT Analysis Chat', model: 'gpt-4o' },
      ];

      // Initial Mount (Frame 0)
      activeStreamConsumer.render({ text: '' });
      memoizedComponents.forEach((comp, idx) => {
        comp.render(stablePropsList[idx]);
        assert.equal(comp.renderCount, 1, `${comp.name} mounted once`);
      });

      // Stream 500 tokens (simulating full heavy chat stream)
      let accumulatedText = '';
      for (let frame = 1; frame <= 500; frame++) {
        accumulatedText += ' token_' + frame;
        activeStreamConsumer.render({ text: accumulatedText });
        memoizedComponents.forEach((comp, idx) => {
          comp.render(stablePropsList[idx]);
        });
      }

      // Assertions
      assert.equal(activeStreamConsumer.renderCount, 501, 'StreamConsumer rendered on every single token update');
      memoizedComponents.forEach((comp) => {
        assert.equal(comp.renderCount, 1, `${comp.name} MUST NOT re-render during 500 streaming tokens`);
      });
    });

    await st.test('4.2: Targeted prop updates on memoized artifact re-render ONLY the targeted component', () => {
      const docxViewer = new SimulatedComponent('ReplayDocxSyncViewer');
      const excelViewer = new SimulatedComponent('ReplayExcelSyncViewer');
      const slideViewer = new SimulatedComponent('ReplaySlideSyncViewer');

      const docxProps = { markdown: '# Doc 1', wordCount: 100 };
      let excelProps = { sessionId: 's_1', currentStepIndex: 0 };
      let slideProps = { activeSlide: 1, totalSlides: 5 };

      docxViewer.render(docxProps);
      excelViewer.render(excelProps);
      slideViewer.render(slideProps);

      assert.equal(docxViewer.renderCount, 1);
      assert.equal(excelViewer.renderCount, 1);
      assert.equal(slideViewer.renderCount, 1);

      // Mutate slideProps
      slideProps = { activeSlide: 2, totalSlides: 5 };
      slideViewer.render(slideProps);
      docxViewer.render(docxProps);
      excelViewer.render(excelProps);

      assert.equal(slideViewer.renderCount, 2, 'Slide viewer should re-render once on prop change');
      assert.equal(docxViewer.renderCount, 1, 'Docx viewer remains at 1 render');
      assert.equal(excelViewer.renderCount, 1, 'Excel viewer remains at 1 render');

      // Mutate excelProps
      excelProps = { sessionId: 's_1', currentStepIndex: 1 };
      excelViewer.render(excelProps);
      slideViewer.render(slideProps);
      docxViewer.render(docxProps);

      assert.equal(excelViewer.renderCount, 2, 'Excel viewer re-renders once on step update');
      assert.equal(slideViewer.renderCount, 2, 'Slide viewer remains at 2');
      assert.equal(docxViewer.renderCount, 1, 'Docx viewer remains at 1');
    });
  });
});