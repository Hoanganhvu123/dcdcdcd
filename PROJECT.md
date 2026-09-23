# Project: OpenWork Live Chatbot & Forensic Audit

## Architecture
- **Frontend**: React 18 + Vite (Tailwind CSS, Framer Motion, AntV G2, Lucide Icons).
  - Shell: `OpenWorkShell.tsx`, `OpenWorkHeader.tsx`, `OpenWorkSidebar.tsx`, `OpenWorkComposer.tsx`, `OpenWorkChatSurface.tsx`, `OpenWorkWorkbench.tsx`.
  - Subpages: `OpenWorkDashboardPage.tsx`, `OpenWorkPromptLibraryPage.tsx`, `OpenWorkDatasourcePage.tsx`, `OpenWorkSkillsMcpPage.tsx`.
  - State & Streaming: `useOpenWorkStore.ts`, `useOpenWorkStream.ts`, `stream-xml-filter.ts`, `deepseek-stream.ts`.
- **Backend & Model Routing**:
  - Live AI Gateway: Remote agent wrap API at `http://160.191.50.138:8787` (proxied via `/api/agent-wrap/v1` and `/api/agent_wrap`).
  - OpenRouter Free Rotation Pool: `openrouter/qwen/qwen3.8-27b:free` + 5 free tier models in `llm_factory.py`.
  - Paid Safety Net: `openrouter/deepseek/deepseek-v4-flash` via Relace provider routing.
  - SSE Streaming & Token Filter: Finite-state machine eliminating `<think>`, `<tool_call>`, and raw `{ "tool_code": ... }` syntax leaks, converting them into structured capability pills and auto-opening the split-screen Workbench.

## Feature Inventory
| # | Feature | Description | Milestone | Status | Source |
|---|---------|-------------|-----------|--------|--------|
| 1 | Server Port & Environment Setup | Free port 5173 from foreign process and run DB-GPT frontend on port 5173 | M1 | DONE | Explorer 1 & 3, Worker 1 |
| 2 | Live Browser Automation via Playwright MCP | Direct Playwright MCP navigation to http://localhost:5173 and OpenWork Shell exploration | M1 | DONE | Explorer 3, Challenger 1 & 2 |
| 3 | 4-Track Live Streaming Verification | Verify Thinking, Tool, Answer, and Artifact tracks under live queries with 0 syntax leaks | M1 | DONE | Explorer 1 & 3, Challenger 2 |
| 4 | OpenRouter Rotation & Relace Fallback Verification | Verify Qwen 3.8 27B free pool and DeepSeek V4 Flash Relace fallback | M1 | DONE | Explorer 1, Auditor 1 |
| 5 | Deep Forensic Quality & Performance Audit | Audit 60fps RAF batching, 0 syntax leaks, Claude.ai theme (#faf8f5 / #1c1917), fluid typography, and layout stability | M2 | DONE | Explorer 2, Auditor 1 (CLEAN) |
| 6 | In-Flight Code Remediation & Build Pass | Fix RAF batching in store, tool syntax interceptor in stream filter, auto-workbench opening, pass `npm --prefix frontend run build` | M3 | DONE | Worker 1, Worker 2, Challenger 2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Survey & Environment Reconnaissance | 3 Explorers map streaming, UI, and browser automation | none | DONE |
| M1 | Live Browser Setup & Chatbot Interaction | Free port 5173, launch frontend, test live queries via Playwright MCP | M0 | DONE |
| M2 | Deep Forensic Quality & Performance Audit | Independent forensic audit of streaming, typography, theme, and stability | M1 | DONE (CLEAN) |
| M3 | In-Flight Remediation & Final Gate | Worker fixes issues, runs build, Challenger/Reviewers/Auditor verify | M2 | DONE (PASS) |

## Interface Contracts
### Client Stream ↔ LLM Gateway
- Endpoint: `/api/agent-wrap/v1/chat/completions` -> `http://160.191.50.138:8787/v1/chat/completions`
- Authorization: `Bearer <AGENT_WRAP_API_KEY>`
- Request: OpenAI-compatible chat completions with `stream: true`.
- Response: SSE chunks `data: {...}\n\n` with `reasoning_content` and `content`.
- Parser Filter: `StreamXMLFilter` intercepts `<think>...</think>`, `<tool_call>...</tool_call>`, and `{ "tool_code": "print(tool(...))" }`. Diverts reasoning to thinking track, tools to capability pills in tool track, auto-opens Workbench in artifact track, and emits clean markdown prose to answer track.

### Frontend Store ↔ Workbench Split-Screen
- Event: `onToolCallDelta` resolves tool metadata and calls `setWorkbenchOpen(true)` + `setActiveTab(type)`.
- Tabs: `files`, `excel`, `slide`, `docx`, `code`, `chart`.

## Code Layout
- Frontend components: `/home/vu-hoang-anh/project/db gpt/frontend/components/openwork/`
- Frontend hooks: `/home/vu-hoang-anh/project/db gpt/frontend/hooks/`
- Frontend styles: `/home/vu-hoang-anh/project/db gpt/frontend/styles/`
- Backend analyst: `/home/vu-hoang-anh/project/db gpt/backend/dbgpt-analyst/src/dbgpt_analyst/`
