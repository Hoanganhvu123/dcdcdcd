"""Progressive Skills Registry — metadata catalog scanner & dynamic loader.

Implements the Deep Agents progressive disclosure pattern:
Level 1: Scan and cache metadata (name, description, domain, required_tools) from YAML frontmatter.
Level 2: Load full markdown procedure body on demand via load_skill_body().
"""

from __future__ import annotations

import logging
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple, Union
import threading
import yaml
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# Security constraints from Deep Agents specification (https://agentskills.io/specification)
MAX_SKILL_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_SKILL_NAME_LENGTH = 64
MAX_SKILL_DESCRIPTION_LENGTH = 1024

_DOMAIN_SKILL_MAP: dict[str, str] = {
    # SQL optimization
    "sql": "sql_optimization",
    "sql_opt": "sql_optimization",
    "sql_optimization": "sql_optimization",
    "sql_engineering": "sql_optimization",
    # Financial metrics
    "financial": "financial_metrics",
    "finance": "financial_metrics",
    "financial_metrics": "financial_metrics",
    "corporate_finance": "financial_metrics",
    # Retail POS
    "retail": "retail_pos_analytics",
    "pos": "retail_pos_analytics",
    "retail_pos": "retail_pos_analytics",
    "retail_pos_analytics": "retail_pos_analytics",
    "retail_commerce": "retail_pos_analytics",
    # Supply chain & inventory
    "supply_chain": "supply_chain_inventory",
    "inventory": "supply_chain_inventory",
    "supply_chain_inventory": "supply_chain_inventory",
    # Spreadsheet modeling
    "spreadsheet": "spreadsheet_modeling",
    "excel": "spreadsheet_modeling",
    "xlsx": "spreadsheet_modeling",
    "spreadsheet_modeling": "spreadsheet_modeling",
    "financial_engineering": "spreadsheet_modeling",
    # Executive deck synthesis
    "deck": "executive_deck_synthesis",
    "slide": "executive_deck_synthesis",
    "slides": "executive_deck_synthesis",
    "presentation": "executive_deck_synthesis",
    "executive_deck": "executive_deck_synthesis",
    "executive_deck_synthesis": "executive_deck_synthesis",
    "executive_presentation": "executive_deck_synthesis",
}


class SkillMetadata(BaseModel):
    """Metadata representation of an agent skill extracted from YAML frontmatter."""

    name: str
    domain: str
    description: str
    required_tools: List[str] = Field(default_factory=list)
    version: str = "1.0.0"
    file_path: Path
    role: str = "worker"
    domain_key: Optional[str] = None
    output_structure: str = "## Phân tích → ## Số liệu cốt lõi → ## Đánh giá & Khuyến nghị"
    mandatory_tools: List[str] = Field(default_factory=list)
    amendment_check: bool = True
    reasoning_steps: List[dict] = Field(default_factory=list)
    validation_requirements: List[str] = Field(default_factory=list)
    validation_rules: List[dict] = Field(default_factory=list)
    ceiling_anchors: Dict[str, dict] = Field(default_factory=dict)
    source_label: str = "Built-in"
    source_layer: int = 0

    model_config = {
        "arbitrary_types_allowed": True,
    }


_DOMAIN_DISPLAY_NAMES: dict[str, str] = {
    "sql_engineering": "Tối ưu hóa Truy vấn & Kiến trúc SQL",
    "corporate_finance": "Chỉ số Tài chính & Hiệu quả Kinh doanh",
    "retail_commerce": "Phân tích Bán lẻ & Dữ liệu Điểm bán (POS)",
    "supply_chain": "Quản trị Chuỗi cung ứng & Tồn kho",
    "financial_engineering": "Mô hình hóa Bảng tính & Xử lý Dữ liệu",
    "executive_presentation": "Tổng hợp & Thiết kế Trình chiếu Cấp cao",
    "chung": "Phân tích Dữ liệu Toàn diện",
}

_DEFAULT_CHUNG_CONFIG: dict[str, Any] = {
    "name": "Phân tích Dữ liệu Toàn diện",
    "reasoning_steps": [
        {
            "step": "Nhận diện bài toán phân tích",
            "concept": "Xác định rõ câu hỏi kinh doanh, nguồn dữ liệu và metric cốt lõi cần giải quyết.",
            "default_anchor": [],
            "must_verify_live": True,
        },
        {
            "step": "Kiểm định & đối soát dữ liệu",
            "concept": "Kiểm tra tính đầy đủ, bất thường, giá trị âm và tính nhất quán của tập số liệu.",
            "default_anchor": [],
            "must_verify_live": True,
        },
        {
            "step": "Tổng hợp insight & khuyến nghị hành động",
            "concept": "Rút ra kết luận có căn cứ số liệu định lượng và bước hành động cụ thể cho ban lãnh đạo.",
            "default_anchor": [],
            "must_verify_live": True,
        },
    ],
    "validation_requirements": [
        "câu trả lời phải đối soát số liệu định lượng có thật từ truy vấn dữ liệu",
        "phải nêu rõ các metric chính và khuyến nghị hành động có tính khả thi",
    ],
    "validation_rules": [],
    "mandatory_tools": [],
    "amendment_check": True,
    "output_structure": "## Phân tích → ## Số liệu cốt lõi → ## Đánh giá & Khuyến nghị",
}


SkillSource = Union[str, Path, Tuple[Union[str, Path], str]]


class SkillRegistry:
    """Registry managing dynamic discovery, catalog indexing, and body retrieval of skills.

    Adopts the Deep Agents Progressive Skills Multi-Source Layering pattern:
    - Layer 0 (Built-in): system default skills (`src/dbgpt_analyst/skills/worker`)
    - Layer 1 (Project): project-level skills (`.agents/skills` or `.agent/skills`)
    - Layer 2 (Custom/Firm): organization or user custom skills pack
    Skills in higher layers override skills in lower layers if they share the same normalized name.
    """

    _instance: Optional[SkillRegistry] = None
    _lock = threading.Lock()

    def __init__(
        self,
        skills_dir: Optional[Union[Path, List[Path]]] = None,
        sources: Optional[List[SkillSource]] = None,
    ) -> None:
        self._sources: List[Tuple[Path, str]] = []

        if sources is not None:
            for s in sources:
                self._add_source_internal(s)
        elif skills_dir is not None:
            if isinstance(skills_dir, list):
                for d in skills_dir:
                    self._add_source_internal((d, "Custom"))
            else:
                self._add_source_internal((skills_dir, "Custom"))
        else:
            # Default Deep Agents Layering
            # Layer 0: Built-in Package Skills
            base_dir = Path(__file__).resolve().parent
            self._add_source_internal((base_dir, "Built-in"))

            # Layer 1: Project Skills (if available in workspace)
            # Check project root and parent directories
            search_roots = [
                base_dir.parent.parent.parent.parent,  # backend root
                base_dir.parent.parent.parent.parent.parent,  # workspace root
                Path.cwd(),
            ]
            for root in search_roots:
                for candidate in [root / ".agents" / "skills", root / ".agent" / "skills"]:
                    if candidate.exists() and candidate.is_dir():
                        self._add_source_internal((candidate, "Project"))
                        break

        self.skills_dirs: List[Path] = [src[0] for src in self._sources]
        self.skills_dir = self.skills_dirs[0] if self.skills_dirs else Path(__file__).resolve().parent
        self._registry: Dict[str, SkillMetadata] = {}
        self._body_cache: Dict[str, str] = {}
        self._load_metadata_catalog()

    def _add_source_internal(self, source: SkillSource) -> None:
        """Helper normalizing a SkillSource into a (Path, label) tuple."""
        if isinstance(source, tuple) and len(source) == 2:
            self._sources.append((Path(source[0]), str(source[1])))
        else:
            p = Path(source)
            self._sources.append((p, p.name or "Custom"))

    def add_source(self, source: SkillSource, reload: bool = True) -> None:
        """Dynamically attach a new skill source pack (e.g. Firm-wide or User Custom skills)."""
        self._add_source_internal(source)
        self.skills_dirs = [src[0] for src in self._sources]
        if reload:
            self._load_metadata_catalog()

    def list_sources(self) -> List[Tuple[Path, str]]:
        """Return list of configured skill source layers (path, label)."""
        return list(self._sources)

    @classmethod
    def get_instance(
        cls,
        skills_dir: Optional[Union[Path, List[Path]]] = None,
        sources: Optional[List[SkillSource]] = None,
    ) -> SkillRegistry:
        """Return the singleton instance with double-checked locking and lazy loading."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(skills_dir=skills_dir, sources=sources)
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (primarily for testing)."""
        with cls._lock:
            cls._instance = None

    def _normalize_name(self, name: str) -> str:
        """Normalize skill names to lowercase, stripped, underscores."""
        return name.lower().strip().replace("-", "_")

    def _load_metadata_catalog(self) -> None:
        """Scan configured source layers in order and parse YAML frontmatter.

        Deep Agents Source Layering:
        Skills loaded in later layers overwrite skills in earlier layers with the same name.
        """
        pattern = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
        self._registry.clear()
        self._body_cache.clear()

        for layer_idx, (s_dir, s_label) in enumerate(self._sources):
            if not s_dir.exists():
                continue

            # Support flat (s_dir/*/SKILL.md) and partitioned (s_dir/worker/*/SKILL.md, s_dir/supervisor/*/SKILL.md)
            candidate_files = set(s_dir.glob("*/SKILL.md")) | set(s_dir.glob("*/*/SKILL.md"))
            for skill_file in sorted(candidate_files):
                try:
                    if skill_file.stat().st_size > MAX_SKILL_FILE_SIZE:
                        logger.warning("Skipping skill file %s: file too large", skill_file)
                        continue

                    content = skill_file.read_text(encoding="utf-8")
                    match = pattern.match(content)
                    if not match:
                        continue

                    raw_yaml = match.group(1)
                    meta_dict = yaml.safe_load(raw_yaml)
                    if isinstance(meta_dict, dict) and "name" in meta_dict:
                        raw_name = str(meta_dict.get("name", skill_file.parent.name))[:MAX_SKILL_NAME_LENGTH]
                        raw_desc = str(meta_dict.get("description", ""))[:MAX_SKILL_DESCRIPTION_LENGTH]

                        parts = skill_file.parts
                        if "supervisor" in parts or meta_dict.get("role") == "supervisor":
                            skill_role = "supervisor"
                        elif "worker" in parts or meta_dict.get("role") == "worker":
                            skill_role = "worker"
                        else:
                            skill_role = "worker" if "skills/worker" in str(skill_file) else "general"

                        metadata = SkillMetadata(
                            name=raw_name,
                            domain=str(meta_dict.get("domain", "general")),
                            description=raw_desc,
                            required_tools=meta_dict.get("required_tools", []) or [],
                            version=str(meta_dict.get("version", "1.0.0")),
                            file_path=skill_file,
                            role=skill_role,
                            domain_key=meta_dict.get("domain_key"),
                            output_structure=meta_dict.get(
                                "output_structure",
                                "## Phân tích → ## Số liệu cốt lõi → ## Đánh giá & Khuyến nghị",
                            ),
                            mandatory_tools=meta_dict.get("mandatory_tools", []) or [],
                            amendment_check=bool(meta_dict.get("amendment_check", True)),
                            reasoning_steps=meta_dict.get("reasoning_steps", []) or [],
                            validation_requirements=meta_dict.get("validation_requirements", []) or [],
                            validation_rules=meta_dict.get("validation_rules", []) or [],
                            ceiling_anchors=meta_dict.get("ceiling_anchors", {}) or {},
                            source_label=s_label,
                            source_layer=layer_idx,
                        )
                        norm_name = self._normalize_name(metadata.name)
                        # Layer priority: Later layers override earlier layers
                        self._registry[norm_name] = metadata
                        logger.debug(
                            "Registered skill: %s (layer=%d, label=%s) from %s",
                            norm_name,
                            layer_idx,
                            s_label,
                            skill_file,
                        )
                except Exception as e:
                    logger.warning("Failed to parse skill file %s: %s", skill_file, e)
                    continue

    def get_prompt_index(self, domain: Optional[str] = None, role: str = "worker") -> str:
        """Generate a concise index of available skills for the system prompt (Progressive Disclosure Level 1).

        Strictly preserves the token budget (<= 650 tokens) while advertising on-demand skills.
        """
        if not self._registry:
            return "No specialized skills loaded."

        relevant_skills = {}
        for k, meta in self._registry.items():
            meta_role = getattr(meta, "role", "worker")
            if role == "all" or meta_role == role or (role == "worker" and meta_role != "supervisor"):
                relevant_skills[k] = meta

        if not relevant_skills:
            return "## KỸ NĂNG CHUYÊN SÂU:\nKhông có kỹ năng nạp sẵn.\n-> Gọi `load_skill(name=...)` khi xử lý."

        skill_tags = ", ".join(f"`{k}`" for k in sorted(relevant_skills.keys()))
        recommended = self.get_skill_for_domain(domain) if domain else None
        rec_line = f"\n⭐ Khuyến nghị: `{recommended.name}`" if recommended and recommended.name in relevant_skills else ""

        return (
            "## KỸ NĂNG CHUYÊN SÂU:\n"
            f"{skill_tags}{rec_line}\n"
            "-> Gọi `load_skill(name=...)` khi xử lý."
        )

    def get_skill_for_domain(self, domain: Optional[str]) -> Optional[SkillMetadata]:
        """Return the most relevant skill for an analytics domain."""
        if not domain:
            return None
        norm_d = domain.lower().strip()
        matched_name = _DOMAIN_SKILL_MAP.get(norm_d) or norm_d
        norm_name = self._normalize_name(matched_name)
        if norm_name in self._registry:
            return self._registry[norm_name]
        for meta in self._registry.values():
            if meta.domain_key == norm_d or meta.domain.lower() == norm_d:
                return meta
        return None

    def get_domain_algorithm(self, domain: str) -> dict[str, Any]:
        """Get domain configuration by domain key or name, falling back to 'chung'."""
        norm_d = domain.lower().strip() if domain else "chung"
        meta = self.get_skill_for_domain(norm_d)
        if meta and meta.reasoning_steps:
            disp_name = _DOMAIN_DISPLAY_NAMES.get(meta.domain_key or norm_d) or meta.description or meta.name
            return {
                "name": disp_name,
                "reasoning_steps": meta.reasoning_steps,
                "validation_requirements": meta.validation_requirements,
                "validation_rules": meta.validation_rules,
                "mandatory_tools": meta.mandatory_tools,
                "amendment_check": meta.amendment_check,
                "output_structure": meta.output_structure,
            }
        return _DEFAULT_CHUNG_CONFIG

    def build_domain_algorithm_hint(self, domain: str) -> str:
        """Build a system hint detailing the reasoning steps and requirements of the domain."""
        cfg = self.get_domain_algorithm(domain)
        hint = f"[DOMAIN METHODOLOGY: {cfg['name'].upper()}]\n"
        hint += "Bạn phải thực hiện suy luận theo đúng các bước phương pháp luận sau:\n"
        for i, step in enumerate(cfg.get("reasoning_steps", []), 1):
            anchors = f" (Ví dụ: {', '.join(step['default_anchor'])})" if step.get("default_anchor") else ""
            hint += f"{i}. {step['step']}: {step['concept']}{anchors}\n"

        hint += "\nYêu cầu về cấu trúc đầu ra:\n"
        hint += f"{cfg.get('output_structure', '')}\n"

        if cfg.get("validation_requirements"):
            hint += "\nYêu cầu kiểm định bắt buộc đối với đáp án:\n"
            for req in cfg["validation_requirements"]:
                hint += f"- {req}\n"

        if cfg.get("mandatory_tools"):
            hint += f"\nBẮT BUỘC sử dụng các công cụ bổ trợ sau trước khi chốt đáp án: {', '.join(cfg['mandatory_tools'])}\n"

        return hint

    def get_domain_validation_requirements(self, domain: str) -> List[str]:
        """Get the conceptual validation requirements for the domain."""
        cfg = self.get_domain_algorithm(domain)
        return cfg.get("validation_requirements", [])

    def get_ceiling_anchors(self) -> Dict[str, dict]:
        """Aggregate all ceiling anchors across registered domain skills."""
        anchors: Dict[str, dict] = {}
        for meta in self._registry.values():
            if meta.ceiling_anchors:
                anchors.update(meta.ceiling_anchors)
        return anchors

    def get_all_domain_algorithms(self) -> Dict[str, dict]:
        """Return all registered domain algorithms dictionary."""
        res: Dict[str, dict] = {}
        for d_key in _DOMAIN_DISPLAY_NAMES.keys():
            res[d_key] = self.get_domain_algorithm(d_key)
        return res

    def load_skill_body(self, skill_name: str) -> str:
        """Read and return full markdown playbook instructions without YAML frontmatter, with lazy caching."""
        norm_name = self._normalize_name(skill_name)
        if norm_name not in self._registry:
            raise KeyError(f"Skill '{skill_name}' not found in registry.")

        # Check lazy memory cache first
        if norm_name in self._body_cache:
            return self._body_cache[norm_name]

        skill_file = self._registry[norm_name].file_path
        content = skill_file.read_text(encoding="utf-8")
        match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
        body = match.group(2).strip() if match else content.strip()
        self._body_cache[norm_name] = body
        return body

    def get_skill(self, skill_name: str) -> Optional[SkillMetadata]:
        """Return SkillMetadata for given skill name if present."""
        norm_name = self._normalize_name(skill_name)
        return self._registry.get(norm_name)

    def list_skills(self) -> List[str]:
        """Return list of all registered skill names."""
        return list(self._registry.keys())

    def evaluate_validation_rules(
        self,
        skill_or_domain: str,
        text: str,
        tools_called: Optional[List[str]] = None,
    ) -> Tuple[bool, List[str]]:
        """Evaluate automated business validation rules and mandatory tools against text response.

        Args:
            skill_or_domain: Skill name or domain key.
            text: Text content of the draft analysis or response.
            tools_called: Optional list of tool names invoked during execution.

        Returns:
            Tuple of (is_valid: bool, error_messages: List[str])
        """
        cfg = self.get_domain_algorithm(skill_or_domain)
        errors: List[str] = []
        lower_text = text.lower()

        # 1. Mandatory tools validation
        mandatory_tools = cfg.get("mandatory_tools", [])
        if mandatory_tools and tools_called is not None:
            called_set = {t.lower() for t in tools_called}
            for mt in mandatory_tools:
                if mt.lower() not in called_set:
                    errors.append(f"Chưa thực thi công cụ bắt buộc: {mt}")

        # 2. Keyword trigger & validation rules
        rules = cfg.get("validation_rules", [])
        for rule in rules:
            triggers = rule.get("trigger_keywords", [])
            # Rule is triggered if any trigger keyword is present in the text
            is_triggered = any(trig.lower() in lower_text for trig in triggers) if triggers else True
            if not is_triggered:
                continue

            required_keywords = rule.get("required_keywords", [])
            # required_keywords can be a list of lists (AND of ORs) or simple list
            rule_failed = False
            for req_group in required_keywords:
                if isinstance(req_group, list):
                    # Any keyword in the sublist satisfies the requirement (OR)
                    if not any(k.lower() in lower_text for k in req_group):
                        rule_failed = True
                        break
                elif isinstance(req_group, str):
                    if req_group.lower() not in lower_text:
                        rule_failed = True
                        break

            if rule_failed:
                err_msg = rule.get("error_message", "Vi phạm quy chuẩn xác thực của lĩnh vực.")
                errors.append(err_msg)

        return len(errors) == 0, errors


def get_skill_registry() -> SkillRegistry:
    """Singleton getter for SkillRegistry (backward compatibility)."""
    return SkillRegistry.get_instance()
