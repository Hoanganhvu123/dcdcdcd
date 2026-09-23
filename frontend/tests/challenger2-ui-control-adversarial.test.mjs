import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import net from 'node:net';
import http from 'node:http';
import {
  OpenworkControlEngine,
  describeError,
  returnedActionError,
  metadataForAction,
  affordanceForAction,
  openworkAffordanceRequestSchema,
  openworkAffordanceResultSchema,
  openworkContextSnapshotSchema,
  SPOTLIGHT_TIMING_MS,
} from './fixtures/control-engine-simulator.mjs';

// ============================================================================
// Direct Classes from Plugin for Raw Network & HTTP Testing
// ============================================================================
export class UIControlWebSocketConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = 1;
    this.buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processFrames();
    });

    socket.on('close', () => {
      this.readyState = 3;
      this.emit('close');
    });

    socket.on('error', (err) => {
      this.readyState = 3;
      this.emit('error', err);
    });
  }

  send(data) {
    if (this.readyState !== 1 || this.socket.destroyed) return;
    const payload = Buffer.from(data, 'utf8');
    const length = payload.length;

    let header;
    if (length <= 125) {
      header = Buffer.from([0x81, length]);
    } else if (length <= 65535) {
      header = Buffer.from([0x81, 126, (length >> 8) & 0xff, length & 0xff]);
    } else {
      const headerBuf = Buffer.alloc(10);
      headerBuf[0] = 0x81;
      headerBuf[1] = 127;
      headerBuf.writeBigUInt64BE(BigInt(length), 2);
      header = headerBuf;
    }

    this.socket.write(Buffer.concat([header, payload]));
  }

  close() {
    if (this.readyState === 1 && !this.socket.destroyed) {
      this.readyState = 2;
      this.socket.write(Buffer.from([0x88, 0x00]));
      this.socket.end();
    }
  }

  processFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        payloadLength = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskKeyLength = isMasked ? 4 : 0;
      const totalLength = offset + maskKeyLength + payloadLength;

      if (this.buffer.length < totalLength) return;

      let maskKey = null;
      if (isMasked) {
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const rawPayload = this.buffer.subarray(offset, offset + payloadLength);
      const payload = Buffer.alloc(payloadLength);

      if (maskKey) {
        for (let i = 0; i < payloadLength; i++) {
          payload[i] = rawPayload[i] ^ maskKey[i % 4];
        }
      } else {
        rawPayload.copy(payload);
      }

      this.buffer = this.buffer.subarray(totalLength);

      if (opcode === 0x1) {
        const text = payload.toString('utf8');
        this.emit('message', text);
      } else if (opcode === 0x8) {
        this.close();
      } else if (opcode === 0x9) {
        if (!this.socket.destroyed) {
          const pongHeader = Buffer.from([0x8a, payload.length]);
          this.socket.write(Buffer.concat([pongHeader, payload]));
        }
      }
    }
  }
}

export class UIControlBridge {
  constructor(options = {}) {
    this.appName = options.appName ?? 'DB-GPT';
    this.version = options.version ?? 2;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.clients = new Set();
    this.pendingRequests = new Map();
    this.latestSnapshot = null;
    this.latestContext = null;
  }

  addClient(ws) {
    this.clients.add(ws);
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      } catch (err) {}
    });
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));

    this.sendToClient(ws, {
      type: 'request',
      id: `init-${Date.now()}`,
      method: 'snapshot',
    });
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  getConnectedClientsCount() {
    return this.clients.size;
  }

  handleClientMessage(ws, message) {
    if (message.type === 'register' || message.type === 'sync') {
      if (message.snapshot && typeof message.snapshot === 'object') {
        this.latestSnapshot = message.snapshot;
      }
      if (message.context && typeof message.context === 'object') {
        this.latestContext = message.context;
      }
      if (message.type === 'register') {
        this.sendToClient(ws, { type: 'registered', ok: true, version: this.version });
      }
      return;
    }

    if (message.type === 'heartbeat') {
      this.sendToClient(ws, { type: 'heartbeat_ack', timestamp: Date.now() });
      return;
    }

    if (message.type === 'response' || ('id' in message && ('result' in message || 'ok' in message || 'error' in message))) {
      const id = String(message.id);
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);
        const ok = message.ok !== false && !message.error;
        pending.resolve({
          id,
          ok,
          result: message.result ?? message,
          error: typeof message.error === 'string' ? message.error : undefined,
          code: typeof message.code === 'string' ? message.code : undefined,
        });
      }
    }
  }

  sendToClient(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {}
  }

  async sendRpc(method, params = {}) {
    const activeClient = Array.from(this.clients).find((c) => c.readyState === 1 || c.readyState === undefined);
    if (!activeClient) {
      if (method === 'snapshot' && this.latestSnapshot) return { ok: true, result: this.latestSnapshot };
      if (method === 'actions' && this.latestSnapshot?.actions) return { ok: true, result: this.latestSnapshot.actions };
      if (method === 'context' && this.latestContext) return { ok: true, result: this.latestContext };
      if (method === 'snapshot') {
        return {
          ok: true,
          result: {
            version: this.version,
            enabled: true,
            route: '/chat',
            status: 'ready',
            busyActionId: null,
            narration: 'Ready.',
            actions: [],
          },
        };
      }
      if (method === 'actions') return { ok: true, result: [] };
      if (method === 'context') {
        return {
          ok: true,
          result: {
            schemaVersion: 1,
            revision: 1,
            capturedAt: new Date().toISOString(),
            screen: { kind: 'other', route: '/chat' },
            conversations: { tabs: [], layout: { kind: 'empty' } },
            chrome: { sidebarOpen: true, applicationMenuVisible: false, rightSidebarExpanded: false },
            execution: { queries: 'parallel', commands: 'serialized', busyCommandId: null, busyActor: null },
            sidePanel: { open: false, ownerSessionId: null, kind: null, tabs: [], activeTabId: null },
            resources: [],
            availableAffordances: [],
            contributions: [],
          },
        };
      }
      return { ok: false, error: 'No active browser window connected.' };
    }

    const id = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({ ok: false, error: `UI Control request timed out after ${this.timeoutMs}ms` });
      }, this.timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          resolve({
            ok: response.ok,
            result: response.result,
            error: response.error,
            code: response.code,
          });
        },
        reject,
        timer,
      });

      this.sendToClient(activeClient, { type: 'request', id, method, params });
    });
  }

  async handleHttpRequest(method, pathname, body = null) {
    if (method === 'GET' && pathname === '/health') {
      return { status: 200, json: { ok: true, app: this.appName, version: this.version } };
    }
    if (method === 'GET' && pathname === '/snapshot') {
      const res = await this.sendRpc('snapshot');
      return res.ok && res.result ? { status: 200, json: res.result } : { status: 500, json: { ok: false, error: res.error } };
    }
    if (method === 'GET' && pathname === '/actions') {
      const res = await this.sendRpc('actions');
      return res.ok && res.result ? { status: 200, json: res.result } : { status: 500, json: { ok: false, error: res.error } };
    }
    if (method === 'GET' && pathname === '/context') {
      const res = await this.sendRpc('context');
      return res.ok && res.result ? { status: 200, json: res.result } : { status: 500, json: { ok: false, error: res.error } };
    }
    if (method === 'POST' && pathname === '/execute') {
      if (!body || typeof body.actionId !== 'string' || !body.actionId.trim()) {
        return { status: 400, json: { ok: false, error: 'Missing required field: actionId' } };
      }
      const res = await this.sendRpc('execute', { actionId: body.actionId, args: body.args ?? {} });
      const resultPayload = res.result;
      const statusCode = res.ok && resultPayload?.ok !== false ? 200 : 400;
      return { status: statusCode, json: resultPayload || { ok: res.ok, actionId: body.actionId, error: res.error } };
    }
    if (method === 'POST' && pathname === '/query') {
      if (!body || typeof body.id !== 'string' || !body.id.trim()) {
        return { status: 400, json: { ok: false, error: 'Missing required field: id' } };
      }
      const res = await this.sendRpc('query', body);
      const resultPayload = res.result;
      const statusCode = res.ok && resultPayload?.ok !== false ? 200 : 400;
      return { status: statusCode, json: resultPayload || { ok: res.ok, id: body.id, error: res.error, code: res.code || 'failed' } };
    }
    if (method === 'POST' && pathname === '/command') {
      if (!body || typeof body.id !== 'string' || !body.id.trim()) {
        return { status: 400, json: { ok: false, error: 'Missing required field: id' } };
      }
      const res = await this.sendRpc('command', body);
      const resultPayload = res.result;
      let statusCode = 200;
      if (!res.ok || resultPayload?.ok === false) {
        const code = resultPayload && 'code' in resultPayload ? resultPayload.code : res.code;
        statusCode = code === 'conflict' ? 409 : 400;
      }
      return { status: statusCode, json: resultPayload || { ok: res.ok, id: body.id, error: res.error, code: res.code || 'failed' } };
    }
    return { status: 404, json: { ok: false, error: `Not found: ${method} ${pathname}` } };
  }
}

// Helpers
function buildClientWsFrame(opcode, payload, mask = true) {
  const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const length = payloadBuf.length;
  let headerBuf;
  const maskBit = mask ? 0x80 : 0x00;

  if (length <= 125) {
    headerBuf = Buffer.alloc(2);
    headerBuf[0] = 0x80 | (opcode & 0x0f);
    headerBuf[1] = maskBit | length;
  } else if (length <= 65535) {
    headerBuf = Buffer.alloc(4);
    headerBuf[0] = 0x80 | (opcode & 0x0f);
    headerBuf[1] = maskBit | 126;
    headerBuf.writeUInt16BE(length, 2);
  } else {
    headerBuf = Buffer.alloc(10);
    headerBuf[0] = 0x80 | (opcode & 0x0f);
    headerBuf[1] = maskBit | 127;
    headerBuf.writeBigUInt64BE(BigInt(length), 2);
  }

  if (mask) {
    const maskKey = crypto.randomBytes(4);
    const maskedPayload = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      maskedPayload[i] = payloadBuf[i] ^ maskKey[i % 4];
    }
    return Buffer.concat([headerBuf, maskKey, maskedPayload]);
  } else {
    return Buffer.concat([headerBuf, payloadBuf]);
  }
}

function parseServerFrames(buffer, onMessage) {
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let headerSize = 2;

    if (payloadLen === 126) {
      if (buffer.length - offset < 4) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerSize = 4;
    } else if (payloadLen === 127) {
      if (buffer.length - offset < 10) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerSize = 10;
    }

    const maskSize = isMasked ? 4 : 0;
    const totalFrameSize = headerSize + maskSize + payloadLen;
    if (buffer.length - offset < totalFrameSize) break;

    const payloadStart = offset + headerSize + maskSize;
    const rawPayload = buffer.subarray(payloadStart, payloadStart + payloadLen);

    if (opcode === 0x1) {
      onMessage({ opcode, text: rawPayload.toString('utf8'), raw: rawPayload });
    } else if (opcode === 0x8 || opcode === 0x9 || opcode === 0xa) {
      onMessage({ opcode, raw: rawPayload });
    }
    offset += totalFrameSize;
  }
  return buffer.subarray(offset);
}

async function createTcpPair() {
  return new Promise((resolve) => {
    let serverSocket;
    let clientSocket;
    const server = net.createServer((sock) => {
      serverSocket = sock;
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      clientSocket = net.connect(port, '127.0.0.1', () => {
        resolve({
          serverSocket,
          clientSocket,
          cleanup: () => {
            serverSocket?.destroy();
            clientSocket?.destroy();
            server.close();
          },
        });
      });
    });
  });
}

function deduceActiveActor(busyActionId) {
  if (busyActionId) {
    if (busyActionId.includes('analyst') || busyActionId.includes('sql')) return 'Analyst Agent';
    if (busyActionId.includes('sheet') || busyActionId.includes('excel')) return 'Sheets Agent';
    if (busyActionId.includes('slide') || busyActionId.includes('deck')) return 'Slides Agent';
    if (busyActionId.includes('research')) return 'Research Agent';
    return 'Autonomous Controller';
  }
  return null;
}

// ============================================================================
// ADVERSARIAL CHALLENGER 2 TEST SUITE
// ============================================================================
test('🔥 CHALLENGER 2: ADVERSARIAL STRESS & EMPIRICAL INTEGRITY SUITE', async (t) => {

  // --------------------------------------------------------------------------
  // SECTION 1: UI Control Bridge REST & WebSocket Endpoints Stress
  // --------------------------------------------------------------------------
  await t.test('Section 1: UI Control Bridge REST & WebSocket Protocol Robustness', async (st) => {

    await st.test('1.1: REST Endpoints Exhaustive Method & Route Status Matrix', async () => {
      const bridge = new UIControlBridge({ appName: 'DB-GPT-Challenger2', version: 2 });

      // GET /health
      const health = await bridge.handleHttpRequest('GET', '/health');
      assert.equal(health.status, 200);
      assert.deepEqual(health.json, { ok: true, app: 'DB-GPT-Challenger2', version: 2 });

      // GET /snapshot
      const snap = await bridge.handleHttpRequest('GET', '/snapshot');
      assert.equal(snap.status, 200);
      assert.equal(snap.json.version, 2);
      assert.equal(snap.json.status, 'ready');

      // GET /actions
      const acts = await bridge.handleHttpRequest('GET', '/actions');
      assert.equal(acts.status, 200);
      assert.deepEqual(acts.json, []);

      // GET /context
      const ctx = await bridge.handleHttpRequest('GET', '/context');
      assert.equal(ctx.status, 200);
      assert.equal(ctx.json.schemaVersion, 1);

      // Illegal HTTP Methods on endpoints -> 404
      const badMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      for (const m of badMethods) {
        const res = await bridge.handleHttpRequest(m, '/health');
        assert.equal(res.status, 404);
      }
      for (const m of ['GET', 'PUT', 'DELETE']) {
        const res = await bridge.handleHttpRequest(m, '/execute');
        assert.equal(res.status, 404);
      }
    });

    await st.test('1.2: Extreme Payload Fuzzing on POST /execute, /query, /command', async () => {
      const bridge = new UIControlBridge();

      const fuzzedBodies = [
        null,
        undefined,
        {},
        { actionId: '' },
        { actionId: '   \n\t   ' },
        { actionId: 123456 },
        { actionId: true },
        { actionId: [] },
        { actionId: {} },
        { id: '' },
        { id: '   ' },
        { id: 98765 },
        { id: null },
      ];

      for (const body of fuzzedBodies) {
        const execRes = await bridge.handleHttpRequest('POST', '/execute', body);
        assert.equal(execRes.status, 400);
        assert.equal(execRes.json.ok, false);

        const qryRes = await bridge.handleHttpRequest('POST', '/query', body);
        assert.equal(qryRes.status, 400);
        assert.equal(qryRes.json.ok, false);

        const cmdRes = await bridge.handleHttpRequest('POST', '/command', body);
        assert.equal(cmdRes.status, 400);
        assert.equal(cmdRes.json.ok, false);
      }
    });

    await st.test('1.3: WebSocket RFC 6455 Byte-by-Byte Framing & Fragmentation Fuzzing', async () => {
      const { serverSocket, clientSocket, cleanup } = await createTcpPair();
      const wsConn = new UIControlWebSocketConnection(serverSocket);
      const received = [];

      wsConn.on('message', (msg) => received.push(msg));

      const complexPayload = JSON.stringify({
        kind: 'adversarial_byte_stream',
        nested: { array: [1, 2, 3, 'hello', { key: 'value' }] },
        padding: 'X'.repeat(250),
      });

      const frame = buildClientWsFrame(0x1, complexPayload, true);

      // Write byte-by-byte with micro-sleeps
      for (let i = 0; i < frame.length; i++) {
        clientSocket.write(frame.subarray(i, i + 1));
        if (i % 20 === 0) await new Promise((r) => setTimeout(r, 1));
      }

      await new Promise((resolve) => {
        const check = () => {
          if (received.length === 1) resolve();
          else setTimeout(check, 10);
        };
        check();
      });

      assert.equal(received.length, 1);
      assert.deepEqual(JSON.parse(received[0]), JSON.parse(complexPayload));
      cleanup();
    });

    await st.test('1.4: 100 WebSocket Frames Storm in Single TCP Segment', async () => {
      const { serverSocket, clientSocket, cleanup } = await createTcpPair();
      const wsConn = new UIControlWebSocketConnection(serverSocket);
      const received = [];

      wsConn.on('message', (msg) => received.push(msg));

      const frames = [];
      for (let i = 0; i < 100; i++) {
        frames.push(buildClientWsFrame(0x1, JSON.stringify({ index: i, nonce: `nonce_${i}` }), true));
      }

      clientSocket.write(Buffer.concat(frames));

      await new Promise((resolve) => {
        const check = () => {
          if (received.length === 100) resolve();
          else setTimeout(check, 10);
        };
        check();
      });

      assert.equal(received.length, 100);
      for (let i = 0; i < 100; i++) {
        const parsed = JSON.parse(received[i]);
        assert.equal(parsed.index, i);
        assert.equal(parsed.nonce, `nonce_${i}`);
      }
      cleanup();
    });

    await st.test('1.5: WebSocket RPC Timeout and Error Handshake', async () => {
      const bridge = new UIControlBridge({ timeoutMs: 80 });
      const { serverSocket, clientSocket, cleanup } = await createTcpPair();
      const wsConn = new UIControlWebSocketConnection(serverSocket);
      bridge.addClient(wsConn);

      let clientBuffer = Buffer.alloc(0);
      clientSocket.on('data', (chunk) => {
        clientBuffer = Buffer.concat([clientBuffer, chunk]);
        clientBuffer = parseServerFrames(clientBuffer, (frame) => {
          if (frame.opcode === 0x1) {
            try {
              const req = JSON.parse(frame.text);
              const targetId = req.params?.id || req.params?.actionId;
              if (targetId === 'action.conflict') {
                const reply = buildClientWsFrame(0x1, JSON.stringify({
                  id: req.id,
                  ok: false,
                  error: 'Already acting on another action',
                  code: 'conflict',
                }), true);
                clientSocket.write(reply);
              }
            } catch {}
          }
        });
      });

      // 1. Conflict response from client -> 409 in HTTP command
      const conflictRes = await bridge.handleHttpRequest('POST', '/command', { id: 'action.conflict' });
      assert.equal(conflictRes.status, 409);
      assert.equal(conflictRes.json.ok, false);
      assert.equal(conflictRes.json.code, 'conflict');

      // 2. Timeout response -> 400
      const timeoutRes = await bridge.handleHttpRequest('POST', '/command', { id: 'action.hang' });
      assert.equal(timeoutRes.status, 400);
      assert.equal(timeoutRes.json.ok, false);
      assert.match(timeoutRes.json.error, /timed out after 80ms/);

      cleanup();
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Concurrency Race Conditions & Revisions
  // --------------------------------------------------------------------------
  await t.test('Section 2: Concurrency Race Conditions & Mutex Exclusivity', async (st) => {

    await st.test('2.1: 100 Simultaneous Overlapping Commands — Exactly 1 Mutex Winner', async () => {
      const engine = new OpenworkControlEngine();
      let activeExecutions = 0;
      let totalCompleted = 0;

      engine.registerAction('atomic_writer', {
        current: {
          id: 'atomic_writer',
          label: 'Atomic Writer',
          kind: 'command',
          sideEffect: 'mutation',
          execute: async () => {
            activeExecutions++;
            assert.equal(activeExecutions, 1, 'MUTEX BREACH: Multiple commands executing concurrently!');
            await new Promise((r) => setTimeout(r, 20));
            activeExecutions--;
            totalCompleted++;
            return { written: true };
          },
        },
      });

      const promises = Array.from({ length: 100 }, (_, i) =>
        engine.command({ id: 'atomic_writer', actor: `client_${i}` })
      );

      const results = await Promise.all(promises);
      const winners = results.filter((r) => r.ok === true);
      const losers = results.filter((r) => r.ok === false && r.code === 'conflict');

      assert.equal(winners.length, 1);
      assert.equal(losers.length, 99);
      assert.equal(totalCompleted, 1);
      assert.equal(engine.busyActionId, null);
      assert.equal(engine.busyActor, null);
    });

    await st.test('2.2: 100 Concurrent Queries During Long Command Without Starvation', async () => {
      const engine = new OpenworkControlEngine();
      let commandRunning = true;
      let resolveCommand;
      const cmdHold = new Promise((r) => { resolveCommand = r; });

      engine.registerAction('long_cmd', {
        current: {
          id: 'long_cmd',
          label: 'Long Command',
          kind: 'command',
          execute: async () => {
            await cmdHold;
            commandRunning = false;
            return { done: true };
          },
        },
      });

      let queryRuns = 0;
      engine.registerAction('fast_qry', {
        current: {
          id: 'fast_qry',
          label: 'Fast Query',
          kind: 'query',
          execute: async () => {
            queryRuns++;
            return { runs: queryRuns, runningWhileCommandActive: commandRunning };
          },
        },
      });

      // Start long command
      const cmdTask = engine.command({ id: 'long_cmd' });
      await new Promise((r) => setTimeout(r, 5));

      // Fire 100 queries while command is busy
      const queryPromises = Array.from({ length: 100 }, () => engine.query({ id: 'fast_qry' }));
      const qResults = await Promise.all(queryPromises);

      assert.equal(qResults.length, 100);
      for (const qr of qResults) {
        assert.equal(qr.ok, true);
        assert.equal(qr.result.runningWhileCommandActive, true);
      }
      assert.equal(queryRuns, 100);

      resolveCommand();
      const cmdRes = await cmdTask;
      assert.equal(cmdRes.ok, true);
      assert.equal(engine.busyActionId, null);
    });

    await st.test('2.3: Monotonic Revision Invariant Across 200 Lifecycle Transitions', async () => {
      const engine = new OpenworkControlEngine();
      let prevRevision = engine.contextRevision;

      for (let i = 0; i < 50; i++) {
        const id = `action_cycle_${i}`;
        const unreg = engine.registerAction(id, {
          current: { id, label: `Cycle ${i}`, kind: 'command', execute: async () => i },
        });
        assert.ok(engine.contextRevision > prevRevision);
        prevRevision = engine.contextRevision;

        const cmdRes = await engine.command({ id });
        assert.equal(cmdRes.ok, true);
        assert.ok(engine.contextRevision > prevRevision);
        prevRevision = engine.contextRevision;

        unreg();
        assert.ok(engine.contextRevision > prevRevision);
        prevRevision = engine.contextRevision;
      }
    });

    await st.test('2.4: expectedRevision Boundary Rejection Matrix', async () => {
      const engine = new OpenworkControlEngine();
      engine.registerAction('boundary_action', {
        current: { id: 'boundary_action', label: 'Boundary Action', kind: 'command', execute: async () => ({ ok: true }) },
      });

      const validRev = engine.contextRevision;

      // Matching revision -> ok
      const okRes = await engine.command({ id: 'boundary_action', expectedRevision: validRev });
      assert.equal(okRes.ok, true);

      const newRev = engine.contextRevision;

      // Stale / Older revision -> 409 conflict
      const staleRes = await engine.command({ id: 'boundary_action', expectedRevision: validRev });
      assert.equal(staleRes.ok, false);
      assert.equal(staleRes.code, 'conflict');
      assert.match(staleRes.error, new RegExp(`OpenWork context changed from revision ${validRev} to ${newRev}`));

      // Future revision -> 409 conflict
      const futureRes = await engine.command({ id: 'boundary_action', expectedRevision: newRev + 50 });
      assert.equal(futureRes.ok, false);
      assert.equal(futureRes.code, 'conflict');

      // Omitted expectedRevision -> succeeds
      const omittedRes = await engine.command({ id: 'boundary_action' });
      assert.equal(omittedRes.ok, true);
    });

    await st.test('2.5: Action Re-registration Token Isolation & Unregister Mid-Flight', async () => {
      const engine = new OpenworkControlEngine();

      // V1
      const unregV1 = engine.registerAction('modal.confirm', {
        current: { id: 'modal.confirm', label: 'Confirm V1', kind: 'command', execute: () => 'v1' },
      });

      // V2 overwrites before V1 unregisters
      const unregV2 = engine.registerAction('modal.confirm', {
        current: { id: 'modal.confirm', label: 'Confirm V2', kind: 'command', execute: () => 'v2' },
      });

      // V1 clean up runs -> V2 must remain!
      unregV1();
      assert.equal(engine.listActions().length, 1);
      assert.equal(engine.listActions()[0].label, 'Confirm V2');

      // Execute while unregistering mid-flight
      let resolveCmd;
      const hold = new Promise((r) => { resolveCmd = r; });
      const unregEphemeral = engine.registerAction('ephemeral', {
        current: {
          id: 'ephemeral',
          label: 'Ephemeral',
          kind: 'command',
          execute: async () => {
            await hold;
            return { done: true };
          },
        },
      });

      const cmdPromise = engine.command({ id: 'ephemeral' });
      await new Promise((r) => setTimeout(r, 5));

      // Unregister while executing
      unregEphemeral();
      assert.equal(engine.listActions().find((a) => a.id === 'ephemeral'), undefined);

      resolveCmd();
      const res = await cmdPromise;
      assert.equal(res.ok, true);
      assert.equal(engine.busyActionId, null);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Spotlight Animation & CoworkerSurface HUD State Transitions
  // --------------------------------------------------------------------------
  await t.test('Section 3: Spotlight Animation Triggers & CoworkerSurface HUD Bursts', async (st) => {

    await st.test('3.1: Spotlight Choreography Sequence & Timing Invariants', async () => {
      const engine = new OpenworkControlEngine();
      let targetRef = { current: { isConnected: true } };

      engine.registerAction('spotlight_btn', {
        current: {
          id: 'spotlight_btn',
          label: 'Spotlight Button',
          kind: 'command',
          targetRef,
          execute: async () => ({ clicked: true }),
        },
      });

      await engine.execute('spotlight_btn');

      const history = engine.spotlightHistory;
      assert.ok(history.length >= 4);
      assert.equal(history[0].phase, 'scrollIntoView');
      assert.equal(history[0].duration, SPOTLIGHT_TIMING_MS.scrollIntoView);
      assert.equal(history[1].phase, 'target');
      assert.equal(history[1].duration, SPOTLIGHT_TIMING_MS.target);
      assert.equal(history[2].phase, 'press');
      assert.equal(history[2].duration, SPOTLIGHT_TIMING_MS.press);
      assert.equal(history[3].phase, 'release');
      assert.equal(history[3].duration, SPOTLIGHT_TIMING_MS.release);
    });

    await st.test('3.2: Missing Target Ref Fallback Timing', async () => {
      const engine = new OpenworkControlEngine();
      engine.registerAction('headless_action', {
        current: {
          id: 'headless_action',
          label: 'Headless Action',
          kind: 'command',
          targetRef: { current: null },
          execute: async () => ({ headless: true }),
        },
      });

      await engine.execute('headless_action');

      const history = engine.spotlightHistory;
      assert.equal(history.length, 1);
      assert.equal(history[0].phase, 'missingTarget');
      assert.equal(history[0].duration, SPOTLIGHT_TIMING_MS.missingTarget);
    });

    await st.test('3.3: 1,000 High-Frequency Narration Event Bursts with Zero Dropped State', async () => {
      const engine = new OpenworkControlEngine();
      const recordedNarrations = [];

      engine.subscribe((snap) => {
        recordedNarrations.push(snap.narration);
      });

      for (let i = 1; i <= 1000; i++) {
        engine.narration = `Streaming token #${i}: Model reasoning step...`;
        engine._notifyListeners();
      }

      assert.equal(recordedNarrations.length, 1001);
      assert.equal(recordedNarrations[1000], 'Streaming token #1000: Model reasoning step...');
      assert.equal(engine.snapshot().narration, 'Streaming token #1000: Model reasoning step...');
    });

    await st.test('3.4: Complete CoworkerSurface HUD Active Actor Deduction Matrix', async () => {
      const testMatrix = [
        { id: 'analyst.run_sql_query', expected: 'Analyst Agent' },
        { id: 'sql.execute_aggregate', expected: 'Analyst Agent' },
        { id: 'sheet.create_workbook', expected: 'Sheets Agent' },
        { id: 'excel.compute_formula', expected: 'Sheets Agent' },
        { id: 'slide.export_presentation', expected: 'Slides Agent' },
        { id: 'deck.build_layout', expected: 'Slides Agent' },
        { id: 'research.browse_web', expected: 'Research Agent' },
        { id: 'generic.click_toolbar', expected: 'Autonomous Controller' },
        { id: null, expected: null },
      ];

      for (const item of testMatrix) {
        const deduced = deduceActiveActor(item.id);
        assert.equal(deduced, item.expected, `Mismatch for action ID: ${item.id}`);
      }
    });

    await st.test('3.5: 100 Concurrent Subscribers Under Rapid HUD State Transitions', async () => {
      const engine = new OpenworkControlEngine();
      const subNotifications = new Array(100).fill(0);
      const unsubs = [];

      for (let i = 0; i < 100; i++) {
        const idx = i;
        const un = engine.subscribe(() => {
          subNotifications[idx]++;
        });
        unsubs.push(un);
      }

      // 20 rapid state mutations
      for (let step = 1; step <= 20; step++) {
        engine.narration = `HUD Transition Step ${step}`;
        engine._notifyListeners();
      }

      // 100 subscribers * 21 notifications = 2,100 callbacks
      for (let i = 0; i < 100; i++) {
        assert.equal(subNotifications[i], 21, `Subscriber ${i} got ${subNotifications[i]} notifications`);
      }

      // Unsubscribe all
      for (const un of unsubs) un();

      engine.narration = 'Post unsubscribe update';
      engine._notifyListeners();

      // No new notifications
      for (let i = 0; i < 100; i++) {
        assert.equal(subNotifications[i], 21);
      }
    });
  });
});
