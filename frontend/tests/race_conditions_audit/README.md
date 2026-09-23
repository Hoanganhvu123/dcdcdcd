# DB-GPT Chat History Race Conditions & Concurrency E2E Test Suite

## Overview
This test suite provides enterprise-grade, deterministic End-to-End (E2E) verification for **DB-GPT Chat History Concurrency, Multi-Tab Synchronization, and Race Condition Isolation**.

The test rig validates that when $\ge 3$ parallel browser contexts attach to the identical chat session (`conversationId` / `conv_uid`) and execute simultaneous, interleaved, or rapid-burst message dispatches at timestamp $T_0$, the system maintains strict data integrity:
- **Zero stream deadlocks or infinite loaders**
- **Zero duplicate message keys or corrupted DOM IDs**
- **Zero token crosstalk across concurrent active streams**
- **Complete history hydration and deduplication upon page reload or fresh tab attach**

---

## Test Suite Architecture

```
frontend/tests/race_conditions_audit/
├── playwright.config.ts                      # Dedicated Playwright configuration with auto-webServer
├── README.md                                 # Architecture & operational runbook
├── helpers/
│   ├── concurrency-harness.ts                # Multi-context manager & barrier dispatch synchronizer
│   └── mock-chat-server.ts                   # High-fidelity route mock server & in-memory state store
└── specs/
    ├── 01-multi-tab-simultaneous-send.spec.ts  # >=3 tabs simultaneous dispatch at T0
    ├── 02-rapid-burst-race.spec.ts             # Consecutive rapid bursts under queue pressure
    ├── 03-interleaved-stream-concurrency.spec.ts # Mid-stream concurrency & token crosstalk prevention
    └── 04-history-hydration-integrity.spec.ts  # Post-concurrency reload hydration & 4th tab attach
```

---

## Test Scenarios & Specifications

### 1. `01-multi-tab-simultaneous-send.spec.ts`
- **Scenario 1.1**: Spawns 3 isolated `BrowserContext` instances attached to the same `conversationId`. Dispatches distinct analytical queries simultaneously at microsecond timestamp $T_0$ via `Promise.all`. Asserts all 3 tabs complete streaming without deadlock, render assistant answers, and have 0 duplicate keys.
- **Scenario 1.2**: 4 tabs simultaneous dispatch with heavy analytical payloads to stress-test prompt handling.

### 2. `02-rapid-burst-race.spec.ts`
- **Scenario 2.1**: Two back-to-back rapid bursts across 3 tabs (Round 1 followed immediately by Round 2). Asserts cumulative multi-turn message history is retained without missing turns.
- **Scenario 2.2**: Rapid burst containing special characters, SQL quotes, emoji, and JSON blocks to verify escaping and serialization integrity.

### 3. `03-interleaved-stream-concurrency.spec.ts`
- **Scenario 3.1**: Tab 1 initiates a long SSE stream response. Tab 2 and Tab 3 dispatch queries mid-stream while Tab 1 is in-flight. Asserts Tab 1 completes without token crosstalk and Tabs 2/3 render cleanly.
- **Scenario 3.2**: Staggered latency response ordering (slow vs. fast query) verifying that out-of-order response arrivals do not clobber UI state.

### 4. `04-history-hydration-integrity.spec.ts`
- **Scenario 4.1**: Multi-tab concurrent message dispatch followed by simultaneous reload (`page.reload()`) of all 3 tabs, plus opening a fresh 4th tab attaching to the same session. Asserts complete history restoration and deduplication.
- **Scenario 4.2**: Hydration against pre-seeded multi-turn backend dialogue data with subsequent new turns.

---

## Execution Commands

### Single-Command Test Runner
From repo root `d:\DB-GPT`:
```powershell
npx playwright test frontend/tests/race_conditions_audit --config=frontend/tests/race_conditions_audit/playwright.config.ts
```

Or via package script in `frontend/`:
```powershell
pnpm --filter db-gpt-web test:e2e
```

### Run Specific Test Spec
```powershell
npx playwright test frontend/tests/race_conditions_audit/specs/01-multi-tab-simultaneous-send.spec.ts --config=frontend/tests/race_conditions_audit/playwright.config.ts
```

### View HTML Test Report
```powershell
npx playwright show-report frontend/tests/race_conditions_audit/race-report
```

---

## Acceptance & Pass Criteria
- **Exit Code**: `0`
- **Pass Rate**: 100% (All 8 tests passing)
- **DOM Invariants**: Zero duplicate `data-message-id` or `data-part-id` attributes, no `data-alert-error` banners, no unhandled exceptions.
- **Microsecond Barrier**: `barrierDispatch` dispatches concurrent submit actions across all contexts at $T_0$.
