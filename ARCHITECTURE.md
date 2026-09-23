# DB-GPT Analyst Agent — Canonical Architecture Specification

> **Status**: Authoritative & Production-Ready  
> **Target Package**: `dbgpt_analyst` ([backend/dbgpt-analyst/](file:///D:/DB-GPT/backend/dbgpt-analyst/))  
> **Runtime**: Python 3.11+, LangGraph, FastAPI, PostgreSQL / SQLite  
> **Documentation Version**: 2.0.0 (Milestone 4 Canonical Architecture Sync)

---

## 1. System Overview & Modular Backend Structure

The **DB-GPT Analyst Agent** is an enterprise-grade multi-agent analytics, business intelligence, and document synthesis system built on top of DB-GPT core packages and LangGraph execution graphs. It handles end-to-end data analytics workloads: autonomous schema exploration, cross-source relationship discovery, self-correcting text-to-SQL generation, Python data science execution in isolated sandboxes, analytical grounding validation, and generation of native Microsoft Office reports ([`.pptx`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/tools/officecli.py), [`.xlsx`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/tools/officecli.py), [`.docx`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/tools/officecli.py)).

### 1.1 High-Level Architecture Topology

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT / FRONTEND LAYER                                 │
│                (Next.js / Ant Design / Chat Page / Artifact Preview)                   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP / SSE Stream
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY (`dbgpt_app`)                                    │
│  - `/api/v1/analyst/chat`         (Sync & Multi-Turn Conversation)                     │
│  - `/api/v1/analyst/stream`       (SSE Event Stream with Custom Artifact Events)       │
│  - `/api/v1/analyst/memory/reset` (Memory Diagnostics & Maintenance)                   │
│  - Startup Lifespan Hook: `bootstrap_analyst_metadata()`                               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     SUPERVISOR AGENT GRAPH (`dbgpt_analyst`)                           │
│  State: `DeepAgentState` (messages, remaining_steps, query_results, artifacts)         │
│  System Prompt: `render_supervisor_system_prompt(max_steps=50)`                        │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              MIDDLEWARE PIPELINE                                 │  │
│  │  1. StepBudgetMiddleware       — Dynamic countdown, <=5 turns warning, cutoff    │  │
│  │  2. VerificationGateMiddleware — Fact extraction, SQL ground truth check, warn  │  │
│  │  3. DoomLoopGuardMiddleware    — Anti-repetition cycle breaker (threshold=3)     │  │
│  │  4. SkillsMiddleware           — Progressive disclosure of SKILL.md modules      │  │
│  │  5. FilesystemBackend          — Virtual & local workspace isolation             │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                            │
│            ┌──────────────────────────────┼──────────────────────────────┐             │
│            ▼                              ▼                              ▼             │
│   ┌─────────────────┐           ┌──────────────────┐           ┌──────────────────┐    │
│   │    SQL Agent    │           │  Hybrid Analyst  │           │  Office Writer   │    │
│   │    Subgraph     │           │     Subgraph     │           │     Subgraph     │    │
│   │ (Discovery/Gen/ │           │ (SQL + Python    │           │ (PPTX/XLSX/DOCX  │    │
│   │  Exec/Critic)   │           │  Code Sandbox)   │           │  Fact Grounding) │    │
│   └─────────────────┘           └──────────────────┘           └──────────────────┘    │
│            │                              │                              │             │
│            ├──────────────────────────────┼──────────────────────────────┤             │
│            ▼                              ▼                              ▼             │
│   ┌─────────────────┐           ┌──────────────────┐           ┌──────────────────┐    │
│   │  Report Writer  │           │ Data Visualizer  │           │  Web Researcher  │    │
│   │    Subgraph     │           │     Subgraph     │           │     Subgraph     │    │
│   │ (Executive MD)  │           │ (AutoChart JSON) │           │ (Search & Scrape)│    │
│   └─────────────────┘           └──────────────────┘           └──────────────────┘    │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             STORAGE & PERSISTENCE LAYER                                │
│                                                                                        │
│   ┌─────────────────────────────────────────┐ ┌──────────────────────────────────────┐ │
│   │       INTERNAL METADATA DATABASE        │ │      CUSTOMER DATA WAREHOUSE         │ │
│   │  `common/db.py::get_metadata_db_conn()` │ │ `common/db.py::get_datasource_conn()`│ │
│   │                                         │ │                                      │ │
│   │  - `table_relationships`                │ │  - External Database                 │ │
│   │  - `golden_queries`                     │ │    (PostgreSQL / MySQL / ClickHouse /│ │
│   │  - `schema_descriptions`                │ │     DuckDB / SQLite)                 │ │
│   │  - `agent_experiences`                  │ │                                      │ │
│   │  - `excel_db_connections`               │ │  - Strictly Read-Only Queries        │ │
│   │  - `datasource_schema_cache`            │ │  - Guarded by `SQLGuard`             │ │
│   │  - `excel_column_definitions`           │ │  - Zero internal tables written here │ │
│   │  - `excel_formula_reports_history`      │ │                                      │ │
│   │  - `query_lineage`                      │ │                                      │ │
│   └─────────────────────────────────────────┘ └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Unified Modular Backend Packages

The backend is organized into decoupled, single-responsibility Python packages under [`backend/`](file:///D:/DB-GPT/backend/):

| Module Path | Package Name | Core Architectural Responsibility |
|---|---|---|
| [`backend/dbgpt-analyst/`](file:///D:/DB-GPT/backend/dbgpt-analyst/) | `dbgpt-analyst` | Core AI Data Analyst engine, Supervisor graph orchestration, subagent subgraphs (SQL, Hybrid Analyst, Office Writer, Report Writer), verification middleware, and BI platform adapters. |
| [`backend/dbgpt-app/`](file:///D:/DB-GPT/backend/dbgpt-app/) | `dbgpt-app` | FastAPI application server, OpenAPI routers ([`analyst_api`](file:///D:/DB-GPT/backend/dbgpt-app/src/dbgpt_app/openapi/api_v1/analyst_api.py), [`analyst_streamer`](file:///D:/DB-GPT/backend/dbgpt-app/src/dbgpt_app/openapi/api_v1/analyst_streamer.py)), server lifespan startup hooks ([`dbgpt_server.py`](file:///D:/DB-GPT/backend/dbgpt-app/src/dbgpt_app/dbgpt_server.py)). |
| [`backend/dbgpt-core/`](file:///D:/DB-GPT/backend/dbgpt-core/) | `dbgpt-core` | Core abstraction layer: LLM provider clients, prompt templates, memory storage contracts, base agent protocols, message serialization. |
| [`backend/dbgpt-serve/`](file:///D:/DB-GPT/backend/dbgpt-serve/) | `dbgpt-serve` | Serve manager framework, microservice lifecycle coordinators, endpoint registration registries. |
| [`backend/dbgpt-ext/`](file:///D:/DB-GPT/backend/dbgpt-ext/) | `dbgpt-ext` | Third-party ecosystem integrations, storage engine drivers, vector database connectors (Chroma, Milvus, PGVector). |
| [`backend/dbgpt-client/`](file:///D:/DB-GPT/backend/dbgpt-client/) | `dbgpt-client` | Python client SDK and CLI utilities for programmatic interaction with DB-GPT APIs. |
| [`backend/dbgpt-sandbox/`](file:///D:/DB-GPT/backend/dbgpt-sandbox/) | `dbgpt-sandbox` | Sandboxed Python code execution environments for secure data science and statistical computing. |
| [`backend/dbgpt-accelerator/`](file:///D:/DB-GPT/backend/dbgpt-accelerator/) | `dbgpt-accelerator` | Hardware acceleration hooks, model inference speedup, and distributed batching pipelines. |

---

## 2. Database Connection Routing & Strict Isolation (Task W)

DB-GPT Analyst Agent enforces **absolute isolation** between internal application state metadata and customer analytical data warehouses.

```
                           Database Connection Router
                     (`dbgpt_analyst.common.db`)
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
   get_metadata_db_connection()       get_datasource_connection(db_name)
                 │                                 │
     Internal Metadata Store             Customer Data Warehouse
  (PostgreSQL or SQLite fallback)     (PostgreSQL, MySQL, ClickHouse,
                 │                     DuckDB, SQLite via Connector)
                 │                                 │
     Read / Write Operations             Strictly Read-Only Queries
  (DDL, Relations, Semantics, Cache)   (Guarded by SQLGuard & AST check)
```

### 2.1 Internal Metadata Database (`get_metadata_db_connection`)
- **Implementation**: [`backend/dbgpt-analyst/src/dbgpt_analyst/common/db.py`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/common/db.py).
- **Target**: Application store configured by `CONV_DATABASE_URL` (PostgreSQL) or fallback local SQLite database (`CFG.SYSTEM_APP`).
- **Access Pattern**: Read/Write. Manages system tables, query lineage, schema caches, and semantic memory.

#### Managed Schema DDL & Constraints:

1. **`table_relationships`**:
   Discovered semantic relationships and foreign keys.
   - **Dual Unique Constraints**:
     * `idx_rel_intra_source`: `UNIQUE (source_id, from_table, from_column, to_table, to_column)` — Single-source discovery ([`libs/bi/data_sync.py`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/libs/bi/data_sync.py)).
     * `idx_rel_cross_source`: `UNIQUE (from_source_id, from_table, from_column, to_source_id, to_table, to_column)` — Multi-source discovery ([`libs/bi/relationship_discovery.py`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/libs/bi/relationship_discovery.py)).
   - **DDL Definition**:
     ```sql
     CREATE TABLE IF NOT EXISTS table_relationships (
         id VARCHAR(64) PRIMARY KEY,
         source_id VARCHAR(64),
         from_source_id VARCHAR(64),
         from_table VARCHAR(128) NOT NULL,
         from_column VARCHAR(128) NOT NULL,
         to_source_id VARCHAR(64),
         to_table VARCHAR(128) NOT NULL,
         to_column VARCHAR(128) NOT NULL,
         join_type VARCHAR(32) DEFAULT 'LEFT',
         confidence REAL DEFAULT 1.0,
         ai_suggested BOOLEAN DEFAULT FALSE,
         confirmed BOOLEAN DEFAULT FALSE,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     );
     CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_intra_source 
         ON table_relationships (source_id, from_table, from_column, to_table, to_column);
     CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_cross_source 
         ON table_relationships (from_source_id, from_table, from_column, to_source_id, to_table, to_column);
     ```

2. **`golden_queries`**:
   Curated, high-performing SQL queries indexed for semantic retrieval and few-shot generation. Supports `pg_trgm` similarity search on PostgreSQL.

3. **`schema_descriptions`**:
   Business glossary definitions, table summaries, and column annotations injected during schema resolution.

4. **`agent_experiences`**:
   Self-reflection logs recording past SQL errors, dialect quirks, and correction patterns.

5. **`excel_db_connections`**:
   Datasource registry with connection strings and credentials.

6. **`datasource_schema_cache`**:
   Pre-computed schema snapshots (tables, column types, primary keys) reducing latency.

7. **`excel_column_definitions`**:
   User-defined column semantics, roles (dimension vs metric), and display formatting.

8. **`excel_formula_reports_history`**:
   Audit log of generated reports and analytical formulas.

9. **`query_lineage`**:
   Lineage DAG linking analytical outputs to source tables and transformations.

### 2.2 Customer Data Warehouse (`get_datasource_connection`)
- **Implementation**: [`backend/dbgpt-analyst/src/dbgpt_analyst/common/db.py`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/common/db.py).
- **Target**: External customer data warehouses accessed via `ConnectorManager`.
- **Security Invariant**:
  * **Strictly Read-Only**: `SELECT` queries only.
  * **SQLGuard Interception**: Any mutation query (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`) is blocked with `SQLGuardError` before execution.
  * **Zero Contamination**: Metadata tables are NEVER created inside customer databases.

---

## 3. Startup Lifecycle & Metadata Bootstrapping (Tasks U & V)

To eliminate runtime `relation does not exist` errors, DB-GPT initializes all metadata tables idempotently upon application startup.

```
FastAPI Server Startup (`dbgpt_app/dbgpt_server.py`)
                    │
                    ▼
      bootstrap_analyst_metadata()
  ([libs/bi/connections.py](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/libs/bi/connections.py))
                    │
    ┌───────────────┴─────────────────────────────────────────┐
    │ 1. init_db_connections_table(conn)                      │
    │    (excel_db_connections, datasource_schema_cache,       │
    │     excel_column_definitions, query_lineage)             │
    │                                                          │
    │ 2. init_history_table(conn)                              │
    │    (excel_formula_reports_history)                       │
    │                                                          │
    │ 3. init_relationships_table(conn)                        │
    │    (table_relationships + dual unique indexes)           │
    │                                                          │
    │ 4. ensure_tables(conn)                                   │
    │    (golden_queries, schema_descriptions,                 │
    │     agent_experiences + pg_trgm indices)                 │
    └──────────────────────────────────────────────────────────┘
```

- **Bootstrapping Entry Point**: [`bootstrap_analyst_metadata()`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/libs/bi/connections.py) is called in the FastAPI lifespan handler in [`backend/dbgpt-app/src/dbgpt_app/dbgpt_server.py`](file:///D:/DB-GPT/backend/dbgpt-app/src/dbgpt_app/dbgpt_server.py).
- **Dialect Awareness**: Automatically detects SQLite vs PostgreSQL (`_is_postgres()`) to configure compatible column types and index algorithms.
- **Error Propagation**: DDL errors log structured diagnostics and raise appropriate exceptions without silent failure swallowing.

---

## 4. Supervisor Multi-Agent Graph Architecture (Task F & G)

The supervisor graph orchestrates multi-agent data analytics through a stateful LangGraph execution engine.

```
User Request / Query
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. StepBudgetMiddleware.before_model()                                  │
│    - Decrements remaining turns                                         │
│    - Injects dynamic {{max_steps}} budget countdown into prompt         │
│    - Injects low-budget warning when remaining turns <= 5               │
│    - Injects jump_to="end" when budget is exhausted                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. DoomLoopGuardMiddleware.wrap_model_call()                            │
│    - Detects repetitive identical tool calls (threshold=3)              │
│    - Injects corrective prompt to force strategy shift                  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. Subagent Delegation & Execution                                      │
│    - SQL Agent Subgraph (Discovery -> Text2SQL -> Execution -> Critic)  │
│    - Hybrid Analyst Subgraph (Pandas / Numpy Sandbox Execution)         │
│    - Office Writer Subgraph (Native PowerPoint, Excel, Word Document)   │
│    - Report Writer Subgraph (Executive Summary Markdown)                │
│    - Data Visualizer Subgraph (AutoChart JSON Configuration)            │
│    - Web Researcher Subgraph (Web Search & Scrape)                      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. VerificationGateMiddleware.after_subagent()                          │
│    - Extracts asserted numbers (currency, %, floats, scientific)        │
│    - Filters benign entities (years 1900-2099, ordinals, dates)         │
│    - Cross-checks asserted numbers against SQL ground truth             │
│    - Strips ungrounded claims or injects corrective feedback            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
Supervisor Synthesis & SSE Stream Delivery
```

### 4.1 State Model & Checkpoint Isolation
- **`DeepAgentState`**:
  * `messages`: Full conversation and tool execution history.
  * `remaining_steps`: Dynamic step countdown integer.
  * `query_results`: Ground-truth SQL query execution cells and column headers.
  * `artifacts`: Generated document references (`.pptx`, `.xlsx`, `.docx`, charts).
- **`SubAgentAdapterState`**:
  * Isolated state wrapper for child subgraphs, preventing subagent internal scratchpads from bloating supervisor context.

### 4.2 Step Budget Countdown (`middleware/step_budget.py`)
- Injects dynamic countdown (`{{ max_steps }}`) based on `SUPERVISOR_RECURSION_LIMIT` (default 50).
- When remaining turns $\le 5$, injects an urgent directive instructing the agent to synthesize findings and stop tool calls.
- Deduplicates warning messages to avoid pollutive context repetition.
- Emits emergency cutoff `jump_to="end"` if budget hits 0.

### 4.3 Analytical Grounding Verification Gate (`middleware/verification_gate.py`)
- **Fact Extraction Engine**:
  * Vietnamese currency formatting: `12,85 tỷ`, `350 triệu`, `45 nghìn`.
  * Standard numeric values: `1,234.56`, `1234,56`, `45.8%`, `+36,9%`.
  * Scientific notations and signed numbers: `-15.4%`, `0.0025`.
- **Benign Token Filtering**:
  * Calendar years (`1900`–`2099`), ISO dates (`2024-08-20`), quarters (`Q1`, `Q2 2026`).
  * Ordinals and rankings (`Top 5`, `Top 10`, `bước 1`).
  * Database schema identifiers.
- **Ground-Truth Validation**:
  * Compares extracted values against `state["query_results"]` cells.
- **Operating Modes**:
  * `sanitize`: Automatically strips ungrounded numeric claims from the message.
  * `warn` (Default): Injects a corrective feedback note into the message list for agent self-correction.
  * `strict`: Raises `VerificationError` immediately if unverified numbers are present.

### 4.4 Progressive Skills Middleware (`middleware/skills.py`)
- Discovers modular skills in [`skills/`](file:///D:/DB-GPT/skills/) (e.g. `financial-report-analyzer`, `csv-data-analysis`, `walmart-sales-analyzer`).
- Parses YAML frontmatter and exposes concise skill descriptions in the system prompt, dynamically loading full skill instructions only when relevant user requests are matched.

---

## 5. DeepAgents Standardized Architecture & FilesystemBackend (Task G)

The [`dbgpt_analyst.libs.deepagents`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/libs/deepagents/) package provides the standardized agent execution harness.

### 5.1 Canonical Re-Exports (`libs/deepagents/__init__.py`)
To prevent split-brain imports across modules, [`backend/dbgpt-analyst/src/dbgpt_analyst/libs/deepagents/__init__.py`](file:///D:/DB-GPT/backend/dbgpt-analyst/src/dbgpt_analyst/libs/deepagents/__init__.py) exports the canonical interface:
```python
from dbgpt_analyst.libs.deepagents import (
    create_deep_agent,
    CompiledDeepAgent,
    DeepAgent,
    DeepAgentState,
    SubAgentAdapterState,
    AgentContext,
    DEFAULT_SYSTEM_PROMPT,
    FilesystemBackend,
    SkillsMiddleware,
    SkillSource,
)
```

### 5.2 FilesystemBackend & Virtual Workspaces
- Implements isolated file read/write backends for data sandboxes and generated office artifacts.
- Enforces path validation to prevent directory traversal and secures user session workspaces.

---

## 6. Verification Protocol & Testing Hierarchy

The DB-GPT Analyst codebase adheres to a 4-Tier verification hierarchy:

```
┌────────────────────────────────────────────────────────────────────────┐
│               TIER 4: Live E2E Verification & Artifact Pipeline        │
│    (Real SQL Queries → Subgraph Execution → .pptx / .xlsx / .docx)     │
├────────────────────────────────────────────────────────────────────────┤
│               TIER 3: Guardrail & Grounding Regression Tests           │
│ (Analytical Grounding, SQL Write Guard, Schema Cache Dialect Fallback) │
├────────────────────────────────────────────────────────────────────────┤
│               TIER 2: Component & Graph Integration Tests              │
│   (Pregel LangGraph Subgraphs, Supervisor Smoke, SSE Event Streams)    │
├────────────────────────────────────────────────────────────────────────┤
│               TIER 1: Pure Unit Tests                                  │
│ (Deterministic Arithmetic, Token Budgeting, Formatting, Dialect SQL)   │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Testing Invariants:
1. **Zero Hardcoded Test Fakes**: All assertions validate genuine computation, state transitions, and real data grounding.
2. **Fact Grounding Enforcement**: Every metric present in generated `.docx`, `.xlsx`, or `.pptx` documents must strictly exist in SQL query results.
3. **Dual Dialect Reliability**: Full operational parity across both SQLite and PostgreSQL database drivers.
4. **Zero Regressions**: 100% test pass rate across `backend/dbgpt-analyst/tests/` (426+ tests passing).

---

## 7. Developer Execution Commands

### 7.1 Running the Full Test Suite
```powershell
$env:PYTHONPATH="D:\DB-GPT\backend\dbgpt-analyst\src;D:\DB-GPT\backend\dbgpt-core\src;D:\DB-GPT\backend\dbgpt-app\src;D:\DB-GPT\backend\dbgpt-serve\src;D:\DB-GPT\backend\dbgpt-ext\src;D:\DB-GPT\backend\dbgpt-client\src"
python -m pytest backend/dbgpt-analyst/tests/ -q
```

### 7.2 Running with Live Office Document Generation
```powershell
$env:OFFICECLI_LIVE_TEST="1"
python -m pytest backend/dbgpt-analyst/tests/test_officecli.py -v
```

---

## 8. DeepSeek V4 Model Integration & Stream Execution

### 8.1 Model Matrix & Endpoints
- **Provider**: `proxy/deepseek`
- **Base URL**: `https://api.deepseek.com`
- **Supported Models**:
  - `deepseek-v4-flash`: Primary high-speed, cost-efficient model for data reasoning and streaming chat.
  - `deepseek-v4-pro`: Deep analytical reasoning and complex multi-step graph orchestration.
  - `deepseek-v4-flash-vision-exp`: Experimental multimodal vision model for chart and document inspection.

### 8.2 ReAct Single-Pass Conversational Fallback
In `dbgpt.agent.expand.react_agent.py`, when a direct user prompt receives natural language dialogue without explicit `Thought/Action/Action Input` step markers, the agent automatically executes an immediate `ActionOutput(terminate=True, content=...)` fallback. This guarantees clean single-round execution (`1/1`) and prevents repetitive 30-round loop failures.

### 8.3 Cross-Platform Stream Unicode Invariants
All incremental stream writes across console output and SSE adapters utilize UTF-8 byte buffer fallback handling, preventing Windows `charmap`/`cp1252` encoding exceptions on Vietnamese and international character sets.

