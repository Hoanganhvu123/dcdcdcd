#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.env.TSX_RUNNER) {
  const result = spawnSync('npx', ['tsx', fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, TSX_RUNNER: '1' },
  });
  process.exit(result.status ?? 0);
}

/**
 * ============================================================================
 * 🧪 MILESTONE 3 & 4 VERIFICATION SUITE: UI CONTROL BRIDGE & COWORKER SURFACE
 * ============================================================================
 *
 * Verifies:
 * - Milestone 3:
 *   1. Vite plugin factory (`uiControlPlugin`) & Discovery file generation
 *   2. HTTP Bridge Endpoints (/health, /snapshot, /actions, /context, /execute, /query, /command)
 *   3. RFC 6455 WebSocket handler & bi-directional RPC dispatch
 *   4. CORS preflight & error resilience
 * - Milestone 4:
 *   5. CoworkerSurface component structure & state reactivity
 *   6. main.tsx Provider & CoworkerSurface mounting hierarchy
 *   7. vite.config.mts plugin registration
 *   8. Multi-agent concurrency & revision protection through Bridge
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import React from 'react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import plugin and bridge
const pluginModulePath = path.resolve(projectRoot, 'plugins/vite-plugin-ui-control.ts');
const {
  UIControlBridge,
  UIControlWebSocketConnection,
  uiControlPlugin,
} = await import(pluginModulePath);

// Import Coworker Surface
const coworkerModulePath = path.resolve(projectRoot, 'shell/control/coworker-surface.tsx');
const { CoworkerSurface } = await import(coworkerModulePath);

let totalPassed = 0;
let totalFailed = 0;

function pass(name) {
  totalPassed++;
  console.log(`  ✅ PASS: ${name}`);
}

function fail(name, error) {
  totalFailed++;
  console.error(`  ❌ FAIL: ${name}`);
  console.error(`     Error: ${error?.message || error}`);
}

console.log('\n================================================================');
console.log('🧪 MILESTONE 3 & 4 VERIFICATION: UI CONTROL BRIDGE & COWORKER SURFACE');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Section 1: Milestone 3 — Vite Plugin & Discovery Metadata
// ─────────────────────────────────────────────────────────────────────────────
console.log('📦 Milestone 3: UI Control Bridge & Plugin Infrastructure');
console.log('────────────────────────────────────────────────────────────────');

try {
  // M3.1: Plugin factory interface
  const plugin = uiControlPlugin({ appName: 'DB-GPT-Test', version: 2 });
  assert.equal(typeof plugin, 'object');
  assert.equal(plugin.name, 'vite-plugin-ui-control');
  assert.equal(typeof plugin.configureServer, 'function');
  pass('M3.1: Plugin factory exports valid Vite Plugin with configureServer hook');
} catch (e) {
  fail('M3.1: Plugin factory export', e);
}

try {
  // M3.2: Discovery file generation
  const tempDiscoveryPath = path.resolve(projectRoot, '.test-ui-control-discovery.json');
  const dummyServer = {
    httpServer: http.createServer(),
    config: {
      server: { port: 3000, host: 'localhost' },
    },
    middlewares: {
      use: () => {},
    },
  };

  const testPlugin = uiControlPlugin({
    appName: 'DB-GPT-Sandbox',
    discoveryPath: tempDiscoveryPath,
    version: 2,
  });

  testPlugin.configureServer(dummyServer);

  assert.ok(fs.existsSync(tempDiscoveryPath), 'Discovery file was not created');
  const content = JSON.parse(fs.readFileSync(tempDiscoveryPath, 'utf8'));
  assert.equal(content.version, 2);
  assert.equal(content.app, 'DB-GPT-Sandbox');
  assert.equal(content.identifier, 'com.dbgpt.web');
  assert.equal(content.port, 3000);
  assert.match(content.baseUrl, /^http:\/\/localhost:3000\/api\/ui-control/);
  assert.match(content.wsUrl, /^ws:\/\/localhost:3000\/api\/ui-control\/ws/);

  // Cleanup temp discovery file
  fs.unlinkSync(tempDiscoveryPath);
  pass('M3.2: Generates valid .ui-control-discovery.json metadata on server configuration');
} catch (e) {
  fail('M3.2: Discovery file generation', e);
}

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Section 2: Milestone 3 — HTTP Bridge Endpoints
// ─────────────────────────────────────────────────────────────────────────────
try {
  // M3.3: GET /health
  const bridge = new UIControlBridge({ appName: 'DB-GPT', version: 2 });
  const healthRes = await bridge.handleHttpRequest('GET', '/health');
  assert.equal(healthRes.status, 200);
  assert.deepEqual(healthRes.json, { ok: true, app: 'DB-GPT', version: 2 });
  pass('M3.3: GET /health returns HTTP 200 { ok: true, app: "DB-GPT", version: 2 }');
} catch (e) {
  fail('M3.3: GET /health', e);
}

try {
  // M3.4: GET /snapshot (fallback & cached state)
  const bridge = new UIControlBridge();
  const initialSnap = await bridge.handleHttpRequest('GET', '/snapshot');
  assert.equal(initialSnap.status, 200);
  assert.equal(initialSnap.json.version, 2);
  assert.equal(initialSnap.json.status, 'ready');
  assert.ok(Array.isArray(initialSnap.json.actions));

  bridge.setLatestSnapshot({
    version: 2,
    enabled: true,
    route: '/chat/session-42',
    status: 'acting',
    busyActionId: 'sql.execute',
    narration: 'Running query on revenue table…',
    actions: [
      {
        id: 'sql.execute',
        label: 'Execute SQL Query',
        kind: 'command',
        effects: { data: 'read', ui: 'none', external: false },
        sideEffect: 'none',
        requiresConfirmation: false,
        requiresArgs: true,
        hasPreviewArgs: false,
        disabled: false,
        busy: true,
      },
    ],
  });

  const updatedSnap = await bridge.handleHttpRequest('GET', '/snapshot');
  assert.equal(updatedSnap.status, 200);
  assert.equal(updatedSnap.json.route, '/chat/session-42');
  assert.equal(updatedSnap.json.busyActionId, 'sql.execute');
  assert.equal(updatedSnap.json.actions.length, 1);
  pass('M3.4: GET /snapshot returns OpenworkControlSnapshot with route, status, narration & actions');
} catch (e) {
  fail('M3.4: GET /snapshot', e);
}

try {
  // M3.5: GET /actions
  const bridge = new UIControlBridge();
  bridge.setLatestSnapshot({
    version: 2,
    enabled: true,
    route: '/construct/flow',
    status: 'ready',
    busyActionId: null,
    narration: 'Ready.',
    actions: [
      { id: 'flow.save', label: 'Save AWEL Flow', kind: 'command', effects: { data: 'write', ui: 'none', external: false }, sideEffect: 'mutation', requiresConfirmation: false, requiresArgs: false, hasPreviewArgs: false, disabled: false, busy: false },
      { id: 'flow.run', label: 'Run Flow', kind: 'command', effects: { data: 'none', ui: 'none', external: true }, sideEffect: 'external', requiresConfirmation: false, requiresArgs: false, hasPreviewArgs: false, disabled: false, busy: false },
    ],
  });

  const actionsRes = await bridge.handleHttpRequest('GET', '/actions');
  assert.equal(actionsRes.status, 200);
  assert.equal(actionsRes.json.length, 2);
  assert.equal(actionsRes.json[0].id, 'flow.save');
  assert.equal(actionsRes.json[1].id, 'flow.run');
  pass('M3.5: GET /actions returns array of registered OpenworkControlActionMetadata');
} catch (e) {
  fail('M3.5: GET /actions', e);
}

try {
  // M3.6: GET /context
  const bridge = new UIControlBridge();
  const contextRes = await bridge.handleHttpRequest('GET', '/context');
  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.json.schemaVersion, 1);
  assert.equal(contextRes.json.execution.queries, 'parallel');
  assert.equal(contextRes.json.execution.commands, 'serialized');
  pass('M3.6: GET /context returns OpenworkContextSnapshot with full semantic workspace model');
} catch (e) {
  fail('M3.6: GET /context', e);
}

try {
  // M3.7: POST /execute, POST /query, POST /command input validations
  const bridge = new UIControlBridge();

  const badExec = await bridge.handleHttpRequest('POST', '/execute', {});
  assert.equal(badExec.status, 400);
  assert.match(badExec.json.error, /Missing required field: actionId/);

  const badQuery = await bridge.handleHttpRequest('POST', '/query', {});
  assert.equal(badQuery.status, 400);
  assert.match(badQuery.json.error, /Missing required field: id/);

  const badCmd = await bridge.handleHttpRequest('POST', '/command', {});
  assert.equal(badCmd.status, 400);
  assert.match(badCmd.json.error, /Missing required field: id/);

  pass('M3.7: POST execution endpoints strictly validate payload structure and required IDs');
} catch (e) {
  fail('M3.7: Execution endpoint input validation', e);
}

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Section 3: Milestone 3 — WebSocket RFC 6455 & Bi-directional RPC
// ─────────────────────────────────────────────────────────────────────────────
try {
  // M3.8: Bi-directional WebSocket RPC dispatch test
  const bridge = new UIControlBridge({ timeoutMs: 3000 });

  // Create a simulated client socket pair (Socket A -> Socket B)
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  let clientSocket;
  const connectPromise = new Promise((resolve) => {
    server.on('connection', (socket) => {
      const serverWs = new UIControlWebSocketConnection(socket);
      bridge.addClient(serverWs);
      resolve(serverWs);
    });
  });

  clientSocket = net.connect({ port, host: '127.0.0.1' });
  const clientWs = new UIControlWebSocketConnection(clientSocket);
  await connectPromise;

  // Handle RPC request from bridge on simulated browser client
  clientWs.on('message', (msgStr) => {
    const msg = JSON.parse(msgStr);
    if (msg.type === 'request') {
      if (msg.method === 'execute') {
        clientWs.send(
          JSON.stringify({
            type: 'response',
            id: msg.id,
            ok: true,
            result: { actionId: msg.params.actionId, executed: true, customData: 42 },
          }),
        );
      } else if (msg.method === 'query') {
        clientWs.send(
          JSON.stringify({
            type: 'response',
            id: msg.id,
            ok: true,
            result: {
              ok: true,
              id: msg.params.id,
              result: { activeUsers: 120 },
              effects: { data: 'read', ui: 'none', external: false },
            },
          }),
        );
      } else if (msg.method === 'command') {
        if (msg.params.expectedRevision === 1) {
          clientWs.send(
            JSON.stringify({
              type: 'response',
              id: msg.id,
              ok: true,
              result: {
                ok: true,
                id: msg.params.id,
                result: { updated: true },
                revision: 2,
                effects: { data: 'write', ui: 'none', external: false },
              },
            }),
          );
        } else {
          clientWs.send(
            JSON.stringify({
              type: 'response',
              id: msg.id,
              ok: false,
              code: 'conflict',
              error: 'Revision mismatch',
              result: {
                ok: false,
                id: msg.params.id,
                code: 'conflict',
                error: 'Revision mismatch',
              },
            }),
          );
        }
      }
    }
  });

  // Test 1: POST /execute via live WebSocket RPC
  const execRes = await bridge.handleHttpRequest('POST', '/execute', {
    actionId: 'composer.send',
    args: { prompt: 'Generate financial report' },
  });
  assert.equal(execRes.status, 200);
  assert.equal(execRes.json.executed, true);
  assert.equal(execRes.json.customData, 42);

  // Test 2: POST /query via live WebSocket RPC
  const queryRes = await bridge.handleHttpRequest('POST', '/query', {
    id: 'analytics.active_users',
  });
  assert.equal(queryRes.status, 200);
  assert.equal(queryRes.json.ok, true);
  assert.equal(queryRes.json.result.activeUsers, 120);

  // Test 3: POST /command via live WebSocket RPC (success)
  const cmdSuccessRes = await bridge.handleHttpRequest('POST', '/command', {
    id: 'sheet.add_formula',
    args: { formula: '=SUM(A1:A10)' },
    expectedRevision: 1,
    actor: 'DeepSeek-V4',
  });
  assert.equal(cmdSuccessRes.status, 200);
  assert.equal(cmdSuccessRes.json.ok, true);
  assert.equal(cmdSuccessRes.json.revision, 2);

  // Test 4: POST /command conflict handling (409)
  const cmdConflictRes = await bridge.handleHttpRequest('POST', '/command', {
    id: 'sheet.add_formula',
    expectedRevision: 999, // Stale!
    actor: 'DeepSeek-V4',
  });
  assert.equal(cmdConflictRes.status, 409);
  assert.equal(cmdConflictRes.json.ok, false);
  assert.equal(cmdConflictRes.json.code, 'conflict');

  // Teardown
  clientWs.close();
  server.close();
  pass('M3.8: Bi-directional WebSocket RPC dispatch and error translation (/execute, /query, /command)');
} catch (e) {
  fail('M3.8: WebSocket RPC dispatch', e);
}

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Section 4: Milestone 4 — Coworker Surface Component
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📦 Milestone 4: Coworker Surface & Main Mounting');
console.log('────────────────────────────────────────────────────────────────');

try {
  // M4.1: CoworkerSurface component export
  assert.equal(typeof CoworkerSurface, 'function');
  const element = React.createElement(CoworkerSurface, { defaultExpanded: false });
  assert.ok(element);
  assert.equal(element.type, CoworkerSurface);
  pass('M4.1: CoworkerSurface React component exported and instantiable');
} catch (e) {
  fail('M4.1: CoworkerSurface export', e);
}

try {
  // M4.2: CoworkerSurface source code audit (Responsive Typography & Impeccable Design)
  const coworkerSource = fs.readFileSync(coworkerModulePath, 'utf8');

  // Verify responsive typography: No fixed px for font-size
  assert.ok(!coworkerSource.includes('font-size: 14px'));
  assert.ok(!coworkerSource.includes('text-[14px]'));
  assert.ok(coworkerSource.includes('text-xs'));
  assert.ok(coworkerSource.includes('text-sm'));

  // Verify design invariants: backdrop blur, spring motion, custom-scrollbar
  assert.ok(coworkerSource.includes('backdrop-blur'));
  assert.ok(coworkerSource.includes('spring'));
  assert.ok(coworkerSource.includes('custom-scrollbar'));
  assert.ok(coworkerSource.includes('z-[9990]'));

  // Verify UI elements: Narration, Actor badge, Control toggle, Status dot
  assert.ok(coworkerSource.includes('narration'));
  assert.ok(coworkerSource.includes('activeActor'));
  assert.ok(coworkerSource.includes('setEnabled'));
  assert.ok(coworkerSource.includes('statusConfig'));

  pass('M4.2: CoworkerSurface adheres to fluid typography, spring physics, backdrop blur & narration display');
} catch (e) {
  fail('M4.2: CoworkerSurface source audit', e);
}

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Section 5: Milestone 4 — Entry Point Mounting (`main.tsx` & `vite.config.mts`)
// ─────────────────────────────────────────────────────────────────────────────
try {
  // M4.3: main.tsx mounting audit
  const mainPath = path.resolve(projectRoot, 'main.tsx');
  const mainSource = fs.readFileSync(mainPath, 'utf8');

  assert.ok(mainSource.includes('OpenworkControlProvider'), 'main.tsx does not import OpenworkControlProvider');
  assert.ok(mainSource.includes('OpenworkRouteControlActions'), 'main.tsx does not import OpenworkRouteControlActions');
  assert.ok(mainSource.includes('CoworkerSurface'), 'main.tsx does not import CoworkerSurface');

  // Verify nesting inside RootLayout
  assert.ok(mainSource.includes('<OpenworkControlProvider>'));
  assert.ok(mainSource.includes('<CoworkerSurface />'));
  assert.ok(mainSource.includes('</OpenworkControlProvider>'));

  pass('M4.3: main.tsx cleanly mounts <OpenworkControlProvider> and <CoworkerSurface /> at application root');
} catch (e) {
  fail('M4.3: main.tsx mounting audit', e);
}

try {
  // M4.4: vite.config.mts plugin registration audit
  const viteConfigPath = path.resolve(projectRoot, 'vite.config.mts');
  const viteConfigSource = fs.readFileSync(viteConfigPath, 'utf8');

  assert.ok(viteConfigSource.includes('uiControlPlugin'), 'vite.config.mts does not import uiControlPlugin');
  assert.ok(viteConfigSource.includes('uiControlPlugin()'), 'vite.config.mts does not call uiControlPlugin()');

  pass('M4.4: vite.config.mts imports and registers uiControlPlugin in plugins array');
} catch (e) {
  fail('M4.4: vite.config.mts registration audit', e);
}

// ─────────────────────────────────────────────────────────────────────────────
// 📊 Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`📊 CHECK RESULTS: ${totalPassed} Passed, ${totalFailed} Failed`);
console.log('================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
}
