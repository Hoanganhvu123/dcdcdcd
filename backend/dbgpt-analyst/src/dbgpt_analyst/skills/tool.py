"""LangChain tool for progressive skill loading on demand."""

from __future__ import annotations

import logging
from langchain_core.tools import tool

from .registry import get_skill_registry

logger = logging.getLogger(__name__)


@tool(parse_docstring=True)
def load_skill(name: str) -> str:
    """Nạp toàn văn cẩm nang và quy trình phân tích chuyên sâu của một kỹ năng dữ liệu.

    Sử dụng công cụ này khi bài toán của người dùng liên quan đến một kỹ năng phân tích
    có trong danh mục Available Skills (ví dụ: 'sql_optimization', 'financial_metrics',
    'retail_pos_analytics', 'supply_chain_inventory', 'spreadsheet_modeling', 'executive_deck_synthesis').
    Công cụ sẽ trả về toàn bộ thuật toán lĩnh vực, công thức tính toán, phương pháp luận
    và quy chuẩn biểu mẫu để thực hiện phân tích chuẩn xác.

    Args:
        name: Tên định danh kỹ năng cần nạp (vd: 'sql_optimization', 'financial_metrics', 'retail_pos_analytics').

    Returns:
        Toàn văn tài liệu hướng dẫn và thuật toán nghiệp vụ chi tiết của kỹ năng dạng Markdown.
    """
    registry = get_skill_registry()
    try:
        norm_name = name.lower().strip().replace("-", "_")
        content = registry.load_skill_body(norm_name)
        meta = registry.get_skill(norm_name)
        domain_label = meta.domain if meta else "Phân tích Dữ liệu"
        actual_name = meta.name if meta else norm_name
        logger.info("Progressive skill loaded successfully: %s", actual_name)
        return f"=== ĐÃ NẠP KỸ NĂNG: {actual_name} (Lĩnh vực: {domain_label}) ===\n\n{content}"
    except KeyError:
        available = ", ".join(sorted(registry.list_skills()))
        logger.warning("Skill '%s' not found in registry. Available: [%s]", name, available)
        return f"Lỗi: Kỹ năng '{name}' không tồn tại. Danh mục khả dụng: [{available}]."
    except Exception as e:
        logger.error("Error loading skill '%s': %s", name, e)
        return f"Lỗi khi nạp kỹ năng '{name}': {str(e)}"
