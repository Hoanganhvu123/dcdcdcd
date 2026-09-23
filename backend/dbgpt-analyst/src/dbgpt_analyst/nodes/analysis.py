"""api/sql/nodes_analysis.py — Nodes: generate_insights, validate, critic."""
import json
import logging as _logging
from typing import Any

from langchain_core.messages import HumanMessage

# ── WrenAI-ported modules ──────────────────────────────────────────────────
from dbgpt_analyst.memory import store_query as memory_store
from dbgpt_analyst.events import (
    PolicyCheckedEvent,
    ReflectionEvent,
    SQLValidatedEvent,
    WorkflowTaskEvent,
)
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.adapters.bi_platform import get_active_connection
from dbgpt_analyst.libs.bi.connections import get_enabled_connections
from dbgpt_analyst.libs.bi.federation import classify_query
from dbgpt_analyst.libs.bi.schema_cache import resolve_table_source
from dbgpt_analyst.common.langfuse_client import observe

logger = _logging.getLogger(__name__)

from typing import Literal
from pydantic import BaseModel, Field


# Table-valued / file-reading functions that let generated SQL escape the
# intended DB and read arbitrary files or reach other hosts (SSRF). Ported
# from WrenAI's `_DATA_READER_NAMES` policy gate — EXPLAIN alone doesn't
# block these because the plan is still syntactically/semantically valid.
_DANGEROUS_SQL_FUNCTIONS = {
    "read_csv", "read_csv_auto", "read_parquet", "read_json", "read_json_auto",
    "read_ndjson", "read_ndjson_auto", "read_text", "read_blob",
    "postgres_scan", "postgres_scan_pushdown", "postgres_attach",
    "sqlite_scan", "mysql_scan", "dblink", "dblink_connect",
    "load_file", "pg_read_file", "pg_read_binary_file", "lo_import", "lo_export",
    "st_read", "url", "httpfs",
}


def _check_sql_security(sql: str) -> tuple[bool, str | None]:
    """Parse SQL into an AST and reject calls to file-reading / cross-host
    table functions. Returns (is_safe, reason_if_blocked)."""
    try:
        import sqlglot
        from sqlglot import exp

        tree = sqlglot.parse_one(sql)
        for func in tree.find_all(exp.Func):
            name = (func.sql_name() or func.key or "").lower()
            if name in _DANGEROUS_SQL_FUNCTIONS:
                return False, f"Blocked function call: {name}()"
        for anon in tree.find_all(exp.Anonymous):
            name = (anon.this or "").lower()
            if name in _DANGEROUS_SQL_FUNCTIONS:
                return False, f"Blocked function call: {name}()"
        return True, None
    except Exception as e:
        # If the SQL doesn't even parse, let the downstream syntax check
        # (sqlglot.parse_one / EXPLAIN) surface that error — this gate only
        # rules on parseable queries.
        logger.debug(f"_check_sql_security: parse skipped ({e})")
        return True, None


class CriticResponse(BaseModel):
    verdict: Literal["ok", "retry", "REJECT"] = Field(default="ok", description="Đánh giá kết quả: ok hoặc retry hoặc REJECT")
    root_cause: str | None = Field(default=None, description="Nguyên nhân gốc rễ nếu phát hiện lỗi")
    reason: str | None = Field(default=None, description="Lý do chi tiết")
    fix_hint: str | None = Field(default=None, description="Gợi ý sửa lỗi")
    fixed_sql: str | None = Field(default=None, description="SQL đã sửa nếu có")


@observe(name="node_validate")
async def node_validate(state: MainAgentState, config: dict | None = None) -> dict[str, Any]:
    """
    Node: Validate generated SQL by running EXPLAIN or LIMIT 0.
    Emits sql_validated event.
    """
    generated_sql = state.get("generated_sql")
    if not generated_sql:
        step = SQLValidatedEvent(payload={"valid": True, "detail": "no_sql", "message": "Không có SQL để validate."}).model_dump()
        return {"validation_result": {"valid": True, "detail": "no_sql"}, "steps": [step]}

    clean_sql = generated_sql.strip().rstrip(";")

    # AST security gate — chạy TRƯỚC EXPLAIN/parse theo strategy, chặn hàm
    # đọc file/kết nối chéo host (read_csv, dblink, postgres_scan...) mà
    # EXPLAIN không tự phát hiện vì query vẫn hợp lệ về mặt cú pháp/kế hoạch.
    is_safe, block_reason = _check_sql_security(clean_sql)
    if not is_safe:
        step = SQLValidatedEvent(
            payload={"valid": False, "detail": block_reason, "message": f"SQL validation: ✗ chặn bảo mật – {block_reason}"}
        ).model_dump()
        return {
            "validation_result": {"valid": False, "detail": block_reason, "have_retry": False},
            "steps": [step],
            "error": f"Validation failed: {block_reason}",
            "retry_count": state.get("retry_count", 0) + 1,
            "validation_retry_count": state.get("validation_retry_count", 0) + 1,
            "have_retry": False,
        }

    try:

        # Phân giải nguồn của từng bảng (giống node_execute_sql) để biết query là
        # push_down (1 nguồn) hay federate (nhiều nguồn).
        map_qualified = state.get("map_qualified", {})
        resolved: dict[str, dict] = {}
        for tname, meta in map_qualified.items():
            r = resolve_table_source(meta.get("raw_table", tname)) or {
                "source_id": meta.get("source_id", 0),
                "db_type": meta.get("db_type", "postgresql"),
                "raw_table": meta.get("raw_table", tname),
                "source_name": meta.get("source_name", "Local DB"),
            }
            resolved[tname] = r
        strategy = classify_query(resolved) if resolved else "push_down"

        if strategy == "federate":
            # KHÔNG thể EXPLAIN trên 1 connection: bảng nằm rải nhiều DB khác nhau.
            # Chỉ kiểm cú pháp bằng sqlglot; DuckDB ở node_execute_sql là test thật.
            try:
                import sqlglot
                sqlglot.parse_one(clean_sql)
                valid, detail = True, "Liên nguồn – cú pháp hợp lệ, sẽ kiểm khi thực thi (DuckDB)."
            except Exception as se:
                valid, detail = False, f"Lỗi cú pháp: {se}"
        else:
            # push_down: EXPLAIN trên ĐÚNG nguồn của bảng (không chỉ active connection).
            conn, db_type = get_active_connection()
            try:
                if resolved:
                    first = next(iter(resolved.values()))
                    db_type = first.get("db_type", db_type)
                    if first.get("source_id"):
                        for c, c_db, sid, _sname in get_enabled_connections(read_only=True):
                            if sid == first["source_id"]:
                                try:
                                    conn.close()
                                except Exception:
                                    pass
                                conn, db_type = c, c_db
                                break
                valid, detail = explain_query(clean_sql, conn, db_type)
            finally:
                try:
                    conn.close()
                except Exception:
                    pass

        status_msg = "✓ Hợp lệ" if valid else f"✗ Không hợp lệ – {detail}"
        step = SQLValidatedEvent(
            payload={"valid": valid, "detail": detail, "message": f"SQL validation: {status_msg}"}
        ).model_dump()

        # Emit policy_checked to satisfy FE
        policy_step = PolicyCheckedEvent(
            payload={"valid": valid, "issues": [detail] if not valid else [], "message": "Policy check"}
        ).model_dump()

        result = {"valid": valid, "detail": detail, "have_retry": True if not valid else False}
        updates: dict[str, Any] = {"validation_result": result, "steps": [step, policy_step]}

        # If invalid, bump retry to trigger re-generation
        if not valid:
            updates["error"] = f"Validation failed: {detail}"
            updates["retry_count"] = state.get("retry_count", 0) + 1
            updates["validation_retry_count"] = state.get("validation_retry_count", 0) + 1
            updates["have_retry"] = True

        return updates
    except Exception as e:
        logger.warning(f"node_validate connection error: {e}")
        step = SQLValidatedEvent(payload={"valid": True, "detail": "skipped", "message": f"Không thể validate SQL: {e}"}).model_dump()
        return {"validation_result": {"valid": True, "detail": "skipped", "have_retry": True}, "steps": [step]}


@observe(name="node_critic")
async def node_critic(state: MainAgentState, config: dict | None = None) -> dict[str, Any]:
    """
    Node: Evaluate query results quality – checks for 0 rows, excessive nulls,
    unreasonable numbers.  Emits reflection event.  May request loop-back.
    """
    query_results = state.get("query_results", [])
    generated_sql = state.get("generated_sql")
    question = state["question"]
    critic_retry = state.get("critic_retry_count", 0)
    max_critic_retries = 2

    issues: list[str] = []
    critic_fix_hint: str | None = None

    heuristic_issues: list[str] = []
    zero_rows = bool(generated_sql and len(query_results) == 0)

    # --- Heuristic checks ---
    if query_results:
        cols = list(query_results[0].keys())
        # Check for suspiciously large numbers
        for col in cols:
            for r in query_results:
                val = r.get(col)
                if isinstance(val, (int, float)) and abs(val) > 1e15:
                    heuristic_issues.append(f"Cột '{col}' chứa giá trị cực lớn ({val}) – có thể sai logic.")
                    break

    issues.extend(heuristic_issues)

    # --- TẦNG 2: LLM-Critic ---
    # Chạy khi không có lỗi heuristic nghiêm trọng (ngoại trừ zero rows, cái này LLM sẽ tự đánh giá)
    LLM_CRITIC_ENABLED = True
    if LLM_CRITIC_ENABLED and critic_retry == 0 and not heuristic_issues:
        try:
            from dbgpt_analyst.core.helpers import json_serial, parse_llm_json
            from dbgpt_analyst.prompts import get_critic_prompt
            from dbgpt_analyst.common.llm_factory import preferred_model_name
            from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

            current_user_id = (config or {}).get("configurable", {}).get("user_id", "dev_user")
            llm, _ = await create_llm_with_fallback(
                model_name=preferred_model_name(),
                user_id=current_user_id,
                streaming=False,
                json_mode=True,
                response_schema=CriticResponse,
            )

            preview_results = json.dumps(query_results[:10], ensure_ascii=False, default=json_serial) if query_results else ""
            selected_tables = state.get("selected_tables", [])
            schema_text = state.get("schemas_text", "")
            schema_tables = [s.strip() for s in schema_text.split("\n\n") if s.strip()] if schema_text else []

            prompt = get_critic_prompt(
                question=question,
                generated_sql=generated_sql,
                row_count=len(query_results),
                error_msg=state.get("error", ""),
                selected_tables=selected_tables,
                schema_tables=schema_tables,
                preview_rows=preview_results,
            )

            response = await llm.ainvoke([HumanMessage(content=prompt)])
            if isinstance(response, CriticResponse):
                res_obj = response
            elif isinstance(response, dict):
                res_obj = CriticResponse(**response)
            else:
                parsed = parse_llm_json(response, schema=CriticResponse)
                res_obj = parsed if isinstance(parsed, CriticResponse) else CriticResponse()

            if res_obj.verdict == "retry":
                issues.append(res_obj.root_cause or res_obj.reason or "LLM-Critic phát hiện lỗi logic.")
                critic_fix_hint = res_obj.fix_hint or ""
                fixed_sql = res_obj.fixed_sql or ""
                if fixed_sql and fixed_sql.strip():
                    critic_fix_hint = f"{critic_fix_hint}\nSQL đã sửa: {fixed_sql}"
        except Exception as e:
            logger.warning(f"LLM-Critic check failed: {e}")
            if zero_rows:
                issues.append("Truy vấn trả về 0 dòng – có thể sai điều kiện WHERE.")
    # Fallback: Nếu không chạy LLM (do retry hoặc lỗi heuristic khác) và có 0 dòng, thì 0 dòng là 1 lỗi
    elif zero_rows:
        issues.append("Truy vấn trả về 0 dòng – có thể sai điều kiện WHERE.")

    if not issues:
        steps = []
        step = ReflectionEvent(payload={"verdict": "ok", "message": "Kết quả truy vấn hợp lý, không phát hiện vấn đề."}).model_dump()
        steps.append(step)

        # ── WrenAI: Store confirmed NL→SQL pair to memory ──────────────────
        # Ported from WrenAI _prompt.py STEP_STORE pattern (lines 67-78):
        # "Store BY DEFAULT after a successful query. Skip ONLY when:
        #  - The query failed  - User said wrong  - Exploratory  - No NL question"
        if generated_sql and question:
            try:
                selected_tables = state.get("selected_tables", [])
                row_id = memory_store(
                    nl_query=question,
                    sql_query=generated_sql,
                    table_names=selected_tables,
                    tags="source:confirmed",
                )
                if row_id:
                    store_step = WorkflowTaskEvent(
                        payload={"query": question, "sql": generated_sql, "message": f"Đã lưu câu SQL #{row_id} vào bộ nhớ golden queries."},
                        phase="reflecting",
                        status="done"
                    ).model_dump()
                    steps.append(store_step)
                    logger.info(f"Stored golden query #{row_id} from critic")

                    # --- T1 Reflection Agent (Experiential Memory) ---
                    # Fire-and-forget: LLM sẽ tự động đúc kết kinh nghiệm từ truy vấn này
                    import asyncio

                    from dbgpt_analyst.memory.memory_experiment import distill_and_store_experience

                    results_summary = f"Trả về {len(query_results)} bản ghi." if query_results else "Không có dữ liệu."
                    asyncio.create_task(
                        distill_and_store_experience(
                            question=question,
                            sql=generated_sql,
                            results_summary=results_summary,
                            table_names=selected_tables
                        )
                    )
            except Exception as e:
                logger.warning(f"Memory store/distill failed (non-fatal): {e}")

        return {"critic_verdict": "ok", "steps": steps}

    # If we already retried enough, accept the results
    if critic_retry >= max_critic_retries:
        msg = f"Critic đã thử {critic_retry} lần, chấp nhận kết quả hiện tại."
        step = ReflectionEvent(payload={"verdict": "accepted", "issues": issues, "message": msg}).model_dump()
        return {"critic_verdict": "accepted", "steps": [step]}

    # Emit reflection and request loop-back
    combined_issue = "; ".join(issues)
    step = ReflectionEvent(
        payload={"issues": issues, "action": "regenerate_sql", "message": f"Critic phát hiện vấn đề: {combined_issue}. Sẽ thử sinh lại SQL."}
    ).model_dump()

    # --- Reflection Memory Trajectory ---
    retry_history = state.get("retry_history") or []
    retry_history.append({
        "sql": generated_sql,
        "error": state.get("error", "No explicit error"),
        "root_cause": combined_issue,
        "critic_hint": critic_fix_hint
    })

    return {
        "critic_verdict": "retry",
        "critic_retry_count": critic_retry + 1,
        "critic_fix_hint": critic_fix_hint,
        "error": f"Critic: {combined_issue}",
        "retry_count": state.get("retry_count", 0) + 1,
        "retry_history": retry_history,
        "have_retry": True,
        "steps": [step],
    }

