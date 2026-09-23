"""api/sql/helpers.py — Tiện ích dùng chung: JSON, parse LLM, lineage, LLM factory."""
from datetime import date, datetime
from decimal import Decimal
import json
import logging
import re
from typing import Any

from dbgpt_analyst.common.db import get_db_connection
from dbgpt_analyst.common.llm_factory import preferred_model_name
from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

logger = logging.getLogger(__name__)


def json_serial(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


from pydantic import BaseModel


def parse_llm_json(content: Any, schema: type[BaseModel] | None = None) -> dict[str, Any] | BaseModel:
    """Extract first valid JSON object or Pydantic model from LLM output."""
    if isinstance(content, BaseModel):
        if not schema or isinstance(content, schema):
            return content
        try:
            return schema.model_validate(content.model_dump())
        except Exception:
            return content

    if not content:
        if schema:
            try:
                return schema()
            except Exception:
                try:
                    return schema.model_construct()
                except Exception:
                    return {}
        return {}

    if isinstance(content, dict):
        res = content
    else:
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif isinstance(block, str):
                    parts.append(block)
            content_str = "".join(parts)
        else:
            content_str = str(content)
        text = content_str.strip()

        res = {}
        # 1. Markdown code fence: ```json ... ```
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if m:
            try:
                res = json.loads(m.group(1).strip())
            except Exception:
                pass

        # 2. Brace-counting: find the first fully balanced {...} object
        if not res:
            start = text.find("{")
            if start != -1:
                depth, in_str, esc = 0, False, False
                for i, ch in enumerate(text[start:], start):
                    if esc:
                        esc = False
                        continue
                    if ch == "\\" and in_str:
                        esc = True
                        continue
                    if ch == '"':
                        in_str = not in_str
                        continue
                    if not in_str:
                        if ch == "{":
                            depth += 1
                        elif ch == "}":
                            depth -= 1
                            if depth == 0:
                                try:
                                    res = json.loads(text[start:i + 1])
                                except Exception:
                                    break
                                break

        # 3. Last resort: first '{' to last '}'
        if not res:
            s, e = text.find("{"), text.rfind("}")
            if s != -1 and e > s:
                try:
                    res = json.loads(text[s:e + 1])
                except Exception:
                    pass

    if isinstance(res, dict):
        for key in ("chart", "input_tables", "questions", "options", "followups", "followup_questions", "sql", "plan_steps"):
            val = res.get(key)
            if isinstance(val, str) and val.strip()[:1] in ("{", "["):
                try:
                    res[key] = json.loads(val.strip())
                except Exception:
                    pass

    if schema:
        try:
            return schema.model_validate(res if isinstance(res, dict) else {})
        except Exception as ex:
            logger.warning(f"Failed to validate JSON output against Pydantic schema {schema.__name__}: {ex}")
            try:
                return schema()
            except Exception:
                try:
                    return schema.model_construct()
                except Exception:
                    return res

    return res


def _extract_xml_tags(text: str) -> dict[str, Any]:
    res = {}
    matches = list(re.finditer(r"<([a-zA-Z0-9_]+)>(.*?)</\1>", text, re.DOTALL))
    for m in matches:
        tag = m.group(1)
        val = m.group(2).strip()
        if "<" in val and ">" in val and re.search(r"<([a-zA-Z0-9_]+)>.*?</\1>", val, re.DOTALL):
            inner_res = _extract_xml_tags(val)
            res.update(inner_res)
        else:
            if val[:1] in ("{", "["):
                try:
                    val = json.loads(val)
                except Exception:
                    pass
            res[tag] = val
    return res


def parse_llm_xml(content: Any, schema: type[BaseModel] | None = None) -> dict[str, Any] | BaseModel:
    """Extract XML tags from LLM output into a dictionary or Pydantic model."""
    if isinstance(content, BaseModel):
        return content if schema else content.model_dump()

    if not content:
        if schema:
            try:
                return schema()
            except Exception:
                try:
                    return schema.model_construct()
                except Exception:
                    return {}
        return {}

    if isinstance(content, dict):
        result = content
    else:
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif isinstance(block, str):
                    parts.append(block)
            text = "".join(parts)
        else:
            text = str(content)

        result = _extract_xml_tags(text)

    if schema:
        try:
            return schema.model_validate(result)
        except Exception as ex:
            logger.warning(f"Failed to validate XML output against Pydantic schema {schema.__name__}: {ex}")
            try:
                return schema()
            except Exception:
                try:
                    return schema.model_construct()
                except Exception:
                    return result

    return result


def log_query_lineage(actor_type: str, actor_id: str, source_id: int, table_name: str, query_sql: str):
    try:
        conn = get_db_connection(read_only=False)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO query_lineage (actor_type, actor_id, source_id, table_name, query_sql) VALUES (%s, %s, %s, %s, %s)",
            (actor_type, actor_id, source_id, table_name, query_sql)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error logging query lineage: {e}")


async def _get_llm(state_or_model: dict | str | None = None, streaming: bool = False, json_mode: bool = True, user_id: str = "dev_user", response_schema: Any = None):
    """Helper: create the preferred LLM. DeepSeek V4 Flash when key available, else Anthropic."""
    if isinstance(state_or_model, str):
        model_name = state_or_model
    elif isinstance(state_or_model, dict) and state_or_model.get("model_name"):
        model_name = state_or_model["model_name"]
    else:
        model_name = preferred_model_name()

    llm, _ = await create_llm_with_fallback(
        model_name=model_name,
        user_id=user_id,
        streaming=streaming,
        json_mode=json_mode,
        response_schema=response_schema,
    )
    return llm
