"""graphs/office_writer.py — Consolidated Office Writer Subgraph.

Compiles document type detection and Office artifact generation (PPTX, DOCX, XLSX).
"""
from __future__ import annotations

from typing import Any

from dbgpt_analyst.subgraphs.modes.office_writer_subgraph import (
    build_office_writer_subgraph,
    node_detect_doc_type,
    node_generate_office_doc,
    office_writer_subgraph,
)

__all__ = [
    "build_office_writer_subgraph",
    "node_detect_doc_type",
    "node_generate_office_doc",
    "office_writer_subgraph",
]
