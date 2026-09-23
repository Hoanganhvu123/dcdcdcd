"""dbgpt_app.openapi.api_v1.seed_replay_data

Enterprise seed traces and in-memory/file-backed Replay Repository for DB-GPT.
Provides authentic multi-turn execution traces, subagent delegations, tool calls,
thinking accordions, live artifacts, and SSE wire streaming converters.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from dbgpt_app.openapi.api_v1.replay_schemas import (
    ReplayArtifactDetail,
    ReplaySessionDetail,
    ReplaySessionListEnvelope,
    ReplaySessionListResponse,
    ReplaySessionSummary,
    ReplayStepDetail,
    ReplayThinkingBlock,
    ReplayToolCall,
    ReplayTurnDetail,
    SubThoughtItem,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Seed Trace 1: canifa-sales-q3-deepdive (4 Turns)
# ═══════════════════════════════════════════════════════════════════════════

def _create_canifa_sales_trace() -> ReplaySessionDetail:
    """Enterprise retail analytical trace for Canifa Q3 Sales Deep-Dive."""
    return ReplaySessionDetail(
        sessionId="canifa-sales-q3-deepdive",
        title="Phân Tích Chuyên Sâu Doanh Thu & Hiệu Quả Bán Hàng Q3/2026 (Canifa)",
        subtitle="So sánh tăng trưởng QoQ, phân bổ kênh bán & rà soát chiết khấu bất thường hệ thống Outlet",
        mode="slides",
        badge="Enterprise Retail BI",
        description="Phiên làm việc tự động giữa AI Coordinator, SQL Analyst và Office Writer phân tích 24.8 triệu USD doanh thu Q3/2026.",
        author="DB-GPT Retail Intelligence Team",
        createdAt="2026-08-22T08:00:00Z",
        updatedAt="2026-08-22T08:14:32Z",
        status="completed",
        totalDurationMs=24500,
        userPrompt="Phân tích toàn diện doanh thu Q3/2026 của Canifa: so sánh theo khu vực & kênh bán hàng, rà soát bất thường chiết khấu tại hệ thống outlet, và xuất bộ slide điều hành 16:9 PPTX.",
        model="deepseek-v4-flash",
        tags=["Retail", "Canifa", "Revenue", "Anomaly Detection", "16:9 Slides", "Excel", "Executive"],
        theme={
            "palette": "monochrome_zinc_emerald",
            "accent": "#00A98F",
            "ink": "#09090B",
            "background": "#FAFAFA",
        },
        turns=[
            # Turn 1: Macro Revenue & Growth
            ReplayTurnDetail(
                turnId="turn_canifa_1",
                turnIndex=1,
                query="Tổng quan doanh thu Q3/2026 và so sánh tốc độ tăng trưởng QoQ với Q2/2026?",
                createdAt="2026-08-22T08:00:05Z",
                finalResponse="### 📊 Tổng Quan Doanh Thu Q3/2026 (Canifa)\n\nTrong Q3/2026, tổng doanh thu toàn chuỗi đạt **24,850,000 USD** (tương đương ~615 tỷ VND), ghi nhận mức tăng trưởng **+18.2% QoQ** so với Q2/2026 ($21.02M). Tổng số đơn hàng xử lý thành công đạt **68,450 đơn** với giá trị đơn bình quân (AOV) đạt **363 USD** (+4.1% QoQ).",
                sqlUsed="SELECT nam, quy, SUM(doanh_thu) AS tong_doanh_thu, COUNT(order_id) AS tong_don_hang, AVG(doanh_thu / so_luong) AS gia_tb FROM canifa_sales_fact WHERE nam = 2026 GROUP BY nam, quy ORDER BY quy ASC;",
                chartSpec={
                    "chartType": "column",
                    "title": "Tăng Trưởng Doanh Thu Canifa Theo Quý 2026",
                    "xAxis": ["Q1/2026", "Q2/2026", "Q3/2026"],
                    "series": [
                        {"name": "Doanh thu (Triệu USD)", "data": [18.4, 21.02, 24.85]},
                        {"name": "Số đơn hàng (Nghìn đơn)", "data": [52.1, 61.3, 68.45]}
                    ]
                },
                steps=[
                    ReplayStepDetail(
                        id="step_canifa_1_1",
                        stepIndex=0,
                        title="Phân tích Ý định & Lập Kế hoạch Truy vấn Kho Dữ liệu",
                        phase="intent",
                        status="completed",
                        agentId="ai_coordinator",
                        agentName="AI Strategic Coordinator",
                        agentType="coordinator",
                        startTimeMs=0,
                        endTimeMs=1200,
                        durationMs=1200,
                        summary="Xác định mục tiêu: trích xuất bảng fact doanh thu năm 2026, tính toán tốc độ tăng trưởng liên quý QoQ và AOV.",
                        thinking=ReplayThinkingBlock(
                            id="think_canifa_1_1",
                            title="Lập kế hoạch truy vấn doanh thu tổng thể",
                            tokens=380,
                            elapsedMs=1100,
                            content="Người dùng yêu cầu báo cáo doanh thu Q3/2026 và so sánh QoQ. Cần truy vấn bảng `canifa_sales_fact` với các chỉ số: SUM(doanh_thu), COUNT(order_id), AOV theo quý.",
                            subThoughtItems=[
                                SubThoughtItem(id="st_1_1", text="Kiểm tra schema bảng canifa_sales_fact", state="completed", durationMs=300),
                                SubThoughtItem(id="st_1_2", text="Xây dựng công thức tính tăng trưởng liên quý QoQ", state="completed", durationMs=450),
                                SubThoughtItem(id="st_1_3", text="Chuẩn bị biểu đồ cột so sánh", state="completed", durationMs=350)
                            ],
                            keyDecisions=["Sử dụng đơn vị USD chuẩn hóa", "Lấy dữ liệu 3 quý đầu năm 2026 để trực quan hóa xu hướng"]
                        ),
                        toolCalls=[]
                    ),
                    ReplayStepDetail(
                        id="step_canifa_1_2",
                        stepIndex=1,
                        title="Thực thi Truy vấn SQL Phân tích Doanh thu Quý",
                        phase="query",
                        status="completed",
                        agentId="sql_analyst",
                        agentName="SQL Data Analyst",
                        agentType="sql_analyst",
                        startTimeMs=1200,
                        endTimeMs=4100,
                        durationMs=2900,
                        summary="Truy vấn dữ liệu doanh thu Q1-Q3/2026 từ kho dữ liệu Snowflake/ClickHouse.",
                        thinking=ReplayThinkingBlock(
                            id="think_canifa_1_2",
                            title="Tối ưu hóa câu lệnh SQL và kiểm tra tính toàn vẹn dữ liệu",
                            tokens=420,
                            elapsedMs=1800,
                            content="Thực hiện GROUP BY theo nam, quy và tính toán tổng doanh số, loại trừ các đơn hàng bị hoàn/hủy.",
                            subThoughtItems=[
                                SubThoughtItem(id="st_1_4", text="Áp dụng bộ lọc order_status = 'COMPLETED'", state="completed", durationMs=600),
                                SubThoughtItem(id="st_1_5", text="Kiểm toán số liệu với bảng tổng hợp tài chính", state="completed", durationMs=1200)
                            ]
                        ),
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_canifa_sql_1",
                                toolType="sql",
                                title="Truy vấn bảng canifa_sales_fact",
                                name="execute_sql",
                                status="success",
                                durationMs=1850,
                                input={
                                    "query": "SELECT nam, quy, SUM(doanh_thu) AS tong_doanh_thu, COUNT(order_id) AS tong_don_hang FROM canifa_sales_fact WHERE nam = 2026 AND trang_thai = 'COMPLETED' GROUP BY nam, quy ORDER BY quy ASC;"
                                },
                                output={
                                    "rowCount": 3,
                                    "columns": ["nam", "quy", "tong_doanh_thu", "tong_don_hang"],
                                    "rows": [
                                        [2026, "Q1", 18400000, 52100],
                                        [2026, "Q2", 21020000, 61300],
                                        [2026, "Q3", 24850000, 68450]
                                    ]
                                }
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="chart_canifa_q3_trend",
                        artifactKind="chart",
                        title="Biểu đồ Tăng trưởng Doanh thu Q1-Q3/2026",
                        mimeType="application/json",
                        version=1,
                        content={
                            "type": "column",
                            "categories": ["Q1/2026", "Q2/2026", "Q3/2026"],
                            "series": [{"name": "Doanh thu ($M)", "data": [18.4, 21.02, 24.85]}]
                        },
                        createdAt="2026-08-22T08:00:15Z"
                    )
                ]
            ),
            # Turn 2: Channel & Regional Breakdown
            ReplayTurnDetail(
                turnId="turn_canifa_2",
                turnIndex=2,
                query="Phân tích chi tiết hiệu quả theo kênh bán hàng (Online vs Offline) và khu vực (Hà Nội, TP.HCM, Đà Nẵng)?",
                createdAt="2026-08-22T08:03:00Z",
                finalResponse="### 🌐 Phân Bổ Kênh & Khu Vực Địa Lý Q3/2026\n\n1. **Kênh Bán Hàng**:\n   - **Online (E-commerce & App)**: Chiếm **58.4%** tổng doanh số ($14.51M), tăng trưởng +26.8% QoQ.\n   - **Offline (Showrooms & Outlets)**: Chiếm **41.6%** tổng doanh số ($10.34M).\n2. **Khu Vực Địa Lý**:\n   - **Hà Nội**: Dẫn đầu doanh số offline với **6.20M USD** (59.9% offline).\n   - **TP. Hồ Chí Minh**: Đạt **3.15M USD**, ghi nhận tốc độ tăng trưởng nhanh nhất (+24.5% YoY).",
                sqlUsed="SELECT khu_vuc, kenh_ban, SUM(doanh_thu) AS doanh_thu, COUNT(order_id) AS so_don FROM canifa_regional_sales WHERE quy = 'Q3/2026' GROUP BY khu_vuc, kenh_ban ORDER BY doanh_thu DESC;",
                steps=[
                    ReplayStepDetail(
                        id="step_canifa_2_1",
                        stepIndex=2,
                        title="Khai thác dữ liệu Phân bổ Khu vực & Kênh Bán Hàng",
                        phase="query",
                        status="completed",
                        agentId="sql_analyst",
                        agentName="SQL Data Analyst",
                        agentType="sql_analyst",
                        startTimeMs=0,
                        endTimeMs=2800,
                        durationMs=2800,
                        summary="Tổng hợp ma trận phân bổ doanh số theo 3 khu vực trọng điểm và 2 kênh bán chính.",
                        thinking=ReplayThinkingBlock(
                            id="think_canifa_2_1",
                            title="Tính toán tỷ trọng kênh online vs offline",
                            tokens=350,
                            elapsedMs=1200,
                            content="Tổng hợp doanh số phân vùng, trích xuất dữ liệu chi tiết cho bảng tính Excel.",
                            subThoughtItems=[
                                SubThoughtItem(id="st_2_1", text="Nhóm theo khu vực và kênh bán hàng", state="completed", durationMs=400),
                                SubThoughtItem(id="st_2_2", text="Tính phần trăm đóng góp trên tổng doanh số", state="completed", durationMs=500)
                            ]
                        ),
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_canifa_sql_2",
                                toolType="sql",
                                title="Truy vấn ma trận doanh thu theo vùng & kênh",
                                name="execute_sql",
                                status="success",
                                durationMs=1600,
                                input={
                                    "query": "SELECT khu_vuc, kenh_ban, SUM(doanh_thu) AS doanh_thu FROM canifa_regional_sales WHERE quy = 'Q3/2026' GROUP BY khu_vuc, kenh_ban;"
                                },
                                output={
                                    "rowCount": 6,
                                    "columns": ["khu_vuc", "kenh_ban", "doanh_thu"],
                                    "rows": [
                                        ["Hà Nội", "Offline", 6200000],
                                        ["Hà Nội", "Online", 8100000],
                                        ["TP.HCM", "Offline", 3150000],
                                        ["TP.HCM", "Online", 5200000],
                                        ["Đà Nẵng", "Offline", 990000],
                                        ["Đà Nẵng", "Online", 1210000]
                                    ]
                                }
                            )
                        ]
                    ),
                    ReplayStepDetail(
                        id="step_canifa_2_2",
                        stepIndex=3,
                        title="Khởi tạo Bảng tính Excel Workbook Đa Sheet",
                        phase="report",
                        status="completed",
                        agentId="office_writer",
                        agentName="Office Automation Specialist",
                        agentType="office_writer",
                        startTimeMs=2800,
                        endTimeMs=4900,
                        durationMs=2100,
                        summary="Tạo bảng tính Excel 'Canifa_Q3_Sales_Breakdown.xlsx' với 3 sheet: Summary, By_Region, By_Channel.",
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_canifa_xlsx_1",
                                toolType="office",
                                title="Xuất file bảng tính Excel",
                                name="export_excel_workbook",
                                status="success",
                                durationMs=1200,
                                input={
                                    "filename": "Canifa_Q3_Sales_Breakdown.xlsx",
                                    "sheets": ["Tong_Quan", "Theo_Khu_Vuc", "Theo_Kenh_Ban"]
                                },
                                output={
                                    "status": "created",
                                    "file_path": "data/artifacts/Canifa_Q3_Sales_Breakdown.xlsx",
                                    "download_url": "/api/v1/analyst/files/Canifa_Q3_Sales_Breakdown.xlsx"
                                }
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="sheet_canifa_q3_breakdown",
                        artifactKind="sheet",
                        title="Bảng Tính Phân Bổ Doanh Thu Canifa Q3/2026",
                        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        version=1,
                        content={
                            "sheets": [
                                {
                                    "name": "Tong_Quan",
                                    "headers": ["Chỉ số", "Q2/2026", "Q3/2026", "Tăng trưởng QoQ"],
                                    "rows": [
                                        ["Doanh thu ($M)", 21.02, 24.85, "+18.2%"],
                                        ["Số đơn hàng", 61300, 68450, "+11.7%"],
                                        ["AOV ($)", 342.9, 363.0, "+5.8%"]
                                    ]
                                },
                                {
                                    "name": "Theo_Khu_Vuc",
                                    "headers": ["Khu vực", "Doanh thu ($M)", "Tỷ trọng (%)", "Số cửa hàng"],
                                    "rows": [
                                        ["Hà Nội", 14.30, "57.5%", 48],
                                        ["TP.HCM", 8.35, "33.6%", 32],
                                        ["Đà Nẵng & Miền Trung", 2.20, "8.9%", 14]
                                    ]
                                }
                            ]
                        },
                        filePath="data/artifacts/Canifa_Q3_Sales_Breakdown.xlsx",
                        downloadUrl="/api/v1/analyst/files/Canifa_Q3_Sales_Breakdown.xlsx",
                        createdAt="2026-08-22T08:03:15Z"
                    )
                ]
            ),
            # Turn 3: Discount Anomaly Detection in Outlets
            ReplayTurnDetail(
                turnId="turn_canifa_3",
                turnIndex=3,
                query="Kiểm tra các giao dịch và cửa hàng có tỷ lệ chiết khấu bất thường trong Q3?",
                createdAt="2026-08-22T08:06:00Z",
                finalResponse="### ⚠️ Phát Hiện Bất Thường Chiết Khấu Tại Hệ Thống Outlet\n\nPhân tích kiểm toán dữ liệu phát hiện điểm nóng tại **Outlet Hà Đông**:\n- **Tỷ lệ chiết khấu trung bình**: **34.8%** (vượt xa mức chuẩn 18.0% của hệ thống Outlet).\n- **Tổng giá trị chiết khấu**: **142,500 USD** trong Q3.\n- **Nguyên nhân chính**: Việc áp dụng chồng chéo 2 chương trình khuyến mãi tự động mà không kích hoạt chặn trần chiết khấu tối đa.",
                sqlUsed="SELECT store_id, store_name, store_type, AVG(discount_rate) AS avg_discount, SUM(discount_amount) AS total_discount FROM store_orders WHERE quy = 'Q3/2026' GROUP BY store_id, store_name, store_type HAVING AVG(discount_rate) > 0.25 ORDER BY avg_discount DESC;",
                steps=[
                    ReplayStepDetail(
                        id="step_canifa_3_1",
                        stepIndex=4,
                        title="Chạy Thuật toán Quét Bất thường & Kiểm toán Chiết khấu",
                        phase="code",
                        status="completed",
                        agentId="data_engineer",
                        agentName="Data Quality & Anomaly Engineer",
                        agentType="data_engineer",
                        startTimeMs=0,
                        endTimeMs=3400,
                        durationMs=3400,
                        summary="Áp dụng Z-score anomaly detector trên 94 điểm bán, phát hiện Outlet Hà Đông lệch 3.4 độ lệch chuẩn.",
                        thinking=ReplayThinkingBlock(
                            id="think_canifa_3_1",
                            title="Phân tích phân phối tỷ lệ chiết khấu theo loại hình cửa hàng",
                            tokens=480,
                            elapsedMs=1900,
                            content="So sánh tỷ lệ chiết khấu giữa Flagship Store (trung bình 8.5%), Standard Store (12.0%) và Outlet (18.0%). Outlet Hà Đông ghi nhận 34.8%, là ngoại lai cực đoan (outlier).",
                            subThoughtItems=[
                                SubThoughtItem(id="st_3_1", text="Tính Z-score cho từng cửa hàng", state="completed", durationMs=600),
                                SubThoughtItem(id="st_3_2", text="Xác định 3 giao dịch có tỷ lệ giảm giá > 50%", state="completed", durationMs=800)
                            ],
                            keyDecisions=["Đề xuất khóa chính sách khuyến mãi kép trong hệ thống POS"]
                        ),
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_canifa_anomaly_1",
                                toolType="sql",
                                title="Truy vấn kiểm toán cửa hàng có tỷ lệ chiết khấu cao",
                                name="execute_sql",
                                status="success",
                                durationMs=1450,
                                input={
                                    "query": "SELECT store_id, store_name, AVG(discount_rate) as avg_disc, SUM(discount_amount) as total_disc FROM canifa_store_audit WHERE quy = 'Q3/2026' GROUP BY store_id, store_name HAVING AVG(discount_rate) > 0.25;"
                                },
                                output={
                                    "rowCount": 1,
                                    "columns": ["store_id", "store_name", "avg_disc", "total_disc"],
                                    "rows": [["ST-OUT-08", "Canifa Outlet Hà Đông", 0.348, 142500]]
                                }
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="doc_canifa_audit_memo",
                        artifactKind="doc",
                        title="Báo Cáo Kiểm Toán Bất Thường Chiết Khấu Q3/2026",
                        mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        version=1,
                        content="# BÁO CÁO KIỂM TOÁN VẬN HÀNH: BẤT THƯỜNG CHIẾT KHẤU OUTLET HÀ ĐÔNG\n\n**Người thực hiện**: Hệ thống Kiểm toán DB-GPT\n**Ngày lập**: 22/08/2026\n\n## 1. Tóm tắt sự vụ\nTrong đợt rà soát dữ liệu bán hàng Q3/2026, hệ thống phát hiện Outlet Hà Đông ghi nhận mức chiết khấu trung bình 34.8%, gây xói mòn lợi nhuận ước tính 142,500 USD...",
                        filePath="data/artifacts/Canifa_Audit_Memo_Q3.docx",
                        downloadUrl="/api/v1/analyst/files/Canifa_Audit_Memo_Q3.docx",
                        createdAt="2026-08-22T08:06:20Z"
                    )
                ]
            ),
            # Turn 4: Executive Deck Export
            ReplayTurnDetail(
                turnId="turn_canifa_4",
                turnIndex=4,
                query="Xuất toàn bộ phát hiện thành bài thuyết trình slide 16:9 PPTX cho Ban Giám Đốc.",
                createdAt="2026-08-22T08:10:00Z",
                finalResponse="### 🎯 Đã Xuất Bản Thành Công Bộ Slide 16:9 PPTX Cho Ban Giám Đốc\n\nBộ slide thuyết trình điều hành gồm **6 trang** hoàn chỉnh chuẩn tỉ lệ 16:9 HD đã được khởi tạo và lưu trữ an toàn. Toàn bộ chỉ số tài chính được tính toán trực tiếp từ dữ liệu thực tế không qua suy diễn ảo.",
                steps=[
                    ReplayStepDetail(
                        id="step_canifa_4_1",
                        stepIndex=5,
                        title="Lập Cấu trúc & Kết xuất Slide Thuyết trình Điều hành 16:9",
                        phase="report",
                        status="completed",
                        agentId="office_writer",
                        agentName="Office Automation Specialist",
                        agentType="office_writer",
                        startTimeMs=0,
                        endTimeMs=4500,
                        durationMs=4500,
                        summary="Tạo 6 slide thuyết trình: Cover, KPI Card, Revenue Trend, Regional Comparison, Discount Anomaly Callout, Q4 Action Plan.",
                        thinking=ReplayThinkingBlock(
                            id="think_canifa_4_1",
                            title="Xây dựng slide deck theo nguyên lý zero-hallucination",
                            tokens=520,
                            elapsedMs=2100,
                            content="Áp dụng module deck.py để render native PPTX shapes và charts, đảm bảo mọi số liệu được ánh xạ từ query rows.",
                            subThoughtItems=[
                                SubThoughtItem(id="st_4_1", text="Cấu hình theme monochrome_zinc_emerald", state="completed", durationMs=400),
                                SubThoughtItem(id="st_4_2", text="Xây dựng 6 SlideSpec chi tiết", state="completed", durationMs=900),
                                SubThoughtItem(id="st_4_3", text="Render native PowerPoint bytes", state="completed", durationMs=800)
                            ],
                            keyDecisions=["Sử dụng layout metric_cards cho KPI", "Dùng callout cho cảnh báo chiết khấu"]
                        ),
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_canifa_deck_1",
                                toolType="deck",
                                title="Tạo slide PowerPoint trình bày Ban Giám Đốc",
                                name="generate_presentation_deck",
                                status="success",
                                durationMs=2300,
                                input={
                                    "title": "Báo Cáo Hiệu Quả Kinh Doanh & Tối Ưu Hóa Chiết Khấu Canifa Q3/2026",
                                    "slide_count": 6,
                                    "theme": "emerald_minimal"
                                },
                                output={
                                    "presentation_id": "deck_canifa_q3_exec",
                                    "slide_count": 6,
                                    "file_path": "data/artifacts/Canifa_Executive_Presentation_Q3.pptx",
                                    "download_url": "/api/v1/analyst/deck/download/deck_canifa_q3_exec.pptx"
                                }
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="deck_canifa_q3_exec",
                        artifactKind="slide",
                        title="Báo Cáo Hiệu Quả Kinh Doanh & Vận Hành Canifa Q3/2026",
                        mimeType="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        version=1,
                        slideCount=6,
                        content={
                            "title": "Báo Cáo Hiệu Quả Kinh Doanh & Vận Hành Canifa Q3/2026",
                            "theme": "emerald_minimal",
                            "slides": [
                                {
                                    "slideNumber": 1,
                                    "layoutType": "title",
                                    "title": "Báo Cáo Hiệu Quả Kinh Doanh & Vận Hành Canifa Q3/2026",
                                    "subtitle": "Phân tích doanh thu 24.8M USD (+18.2% QoQ) và kiểm toán tối ưu hóa chiết khấu chuỗi bán lẻ"
                                },
                                {
                                    "slideNumber": 2,
                                    "layoutType": "metric_cards",
                                    "title": "Chỉ Số Hiệu Suất Trọng Yếu Q3/2026",
                                    "kpis": [
                                        {"label": "Tổng doanh thu", "value": 24850000, "formatted": "24,85 triệu $", "trend": "+18.2% QoQ", "color": "emerald"},
                                        {"label": "Tổng đơn hàng", "value": 68450, "formatted": "68,450 đơn", "trend": "+11.7% QoQ", "color": "navy"},
                                        {"label": "AOV (Giá trị TB/Đơn)", "value": 363.0, "formatted": "363.0 $", "trend": "+5.8% QoQ", "color": "violet"}
                                    ]
                                },
                                {
                                    "slideNumber": 3,
                                    "layoutType": "chart",
                                    "title": "Xu Hướng Tăng Trưởng Doanh Thu 3 Quý Liên Tiếp",
                                    "categoryColumn": "quy",
                                    "valueColumn": "doanh_thu"
                                },
                                {
                                    "slideNumber": 4,
                                    "layoutType": "comparison",
                                    "title": "So Sánh Hiệu Quả Khu Vực Trọng Điểm",
                                    "columns": [
                                        {
                                            "header": "Hà Nội (Thị phần lớn nhất)",
                                            "badge": "57.5% DOANH SỐ",
                                            "bullets": ["Doanh thu offline đạt 6.2M USD", "48 cửa hàng hoạt động ổn định", "Chiết khấu kiểm soát ở mức 12.0%"]
                                        },
                                        {
                                            "header": "TP. Hồ Chí Minh (Tăng trưởng nhanh)",
                                            "badge": "+24.5% YoY",
                                            "bullets": ["Doanh thu online bùng nổ đạt 5.2M USD", "Mở rộng thêm 6 showroom mới", "Tỷ lệ khách hàng thân thiết quay lại đạt 41%"]
                                        }
                                    ]
                                },
                                {
                                    "slideNumber": 5,
                                    "layoutType": "callout",
                                    "title": "Cảnh Báo Kiểm Toán: Bất Thường Chiết Khấu",
                                    "headline": "Outlet Hà Đông chiết khấu 34.8% (Mức chuẩn: 18.0%), gây thâm hụt 142.5K USD",
                                    "insights": [
                                        "Nguyên nhân: Lỗi cấu hình kích hoạt đồng thời 2 chương trình giảm giá.",
                                        "Hành động ngay: Khóa áp dụng giảm giá kép trên hệ thống POS trung tâm.",
                                        "Dự kiến thu hồi & bảo toàn biên lợi nhuận: +1.8% cho toàn ngành hàng."
                                    ]
                                },
                                {
                                    "slideNumber": 6,
                                    "layoutType": "takeaway",
                                    "title": "Kế Hoạch Hành Động Q4/2026",
                                    "takeaways": [
                                        {"priority": "01", "title": "Tối ưu hóa Kênh Online", "description": "Nâng cấp hạ tầng thương mại điện tử đón đầu mùa mua sắm cuối năm."},
                                        {"priority": "02", "title": "Chuẩn hóa Trần Chiết Khấu POS", "description": "Áp dụng giới hạn trần chiết khấu tối đa 25% tự động toàn hệ thống."},
                                        {"priority": "03", "title": "Mở rộng 12 Điểm Bán Miền Nam", "description": "Tập trung khai thác thị trường TP.HCM và các tỉnh lân cận."}
                                    ]
                                }
                            ]
                        },
                        filePath="data/artifacts/Canifa_Executive_Presentation_Q3.pptx",
                        downloadUrl="/api/v1/analyst/deck/download/deck_canifa_q3_exec.pptx",
                        createdAt="2026-08-22T08:10:20Z"
                    )
                ]
            )
        ]
    )


# ═══════════════════════════════════════════════════════════════════════════
# Seed Trace 2: inventory-stockout-forecast (3 Turns)
# ═══════════════════════════════════════════════════════════════════════════

def _create_inventory_trace() -> ReplaySessionDetail:
    """Supply chain inventory turnover and stockout risk forecast trace."""
    return ReplaySessionDetail(
        sessionId="inventory-stockout-forecast",
        title="Dự Báo & Tối Ưu Hóa Tồn Kho Chuỗi Cung Ứng Mùa Thu Đông 2026",
        subtitle="Đo lường chỉ số Turnover, cân bằng kho Bắc - Nam & cảnh báo nguy cơ đứt gãy 12 SKU trọng yếu",
        mode="sheets",
        badge="Supply Chain & Ops",
        description="Phân tích vòng quay tồn kho 4.8x và tự động thiết lập kế hoạch điều chuyển hàng liên kho.",
        author="DB-GPT Supply Chain Operations",
        createdAt="2026-08-22T07:15:00Z",
        updatedAt="2026-08-22T07:28:40Z",
        status="completed",
        totalDurationMs=18200,
        userPrompt="Đánh giá vòng quay hàng tồn kho (Inventory Turnover) và dự báo nguy cơ đứt gãy tồn kho (Stockout Risk) các SKU mùa thu đông trong 30 ngày tới.",
        model="deepseek-v4-flash",
        tags=["Supply Chain", "Inventory", "Turnover", "Stockout Risk", "Warehouse", "Excel"],
        theme={
            "palette": "tech_slate",
            "accent": "#2563EB",
            "ink": "#0F172A",
            "background": "#F8FAFC",
        },
        turns=[
            ReplayTurnDetail(
                turnId="turn_inv_1",
                turnIndex=1,
                query="Đo lường chỉ số vòng quay tồn kho (Turnover Ratio) và số ngày tồn kho (Days on Hand) theo danh mục sản phẩm?",
                createdAt="2026-08-22T07:15:05Z",
                finalResponse="### 📦 Đánh Giá Vòng Quay Tồn Kho Q3/2026\n\n- **Nhóm Áo khoác & Áo len**: Tốc độ luân chuyển rất cao, **Turnover = 4.8x**, số ngày tồn kho bình quân **DOH = 38 ngày**.\n- **Nhóm Đồ lót & Trang phục cơ bản**: Tốc độ luân chuyển trung bình, **Turnover = 2.1x**, **DOH = 78 ngày**.",
                sqlUsed="SELECT category_name, SUM(cogs) / AVG(inventory_value) AS turnover_ratio, (AVG(inventory_value) / SUM(cogs)) * 90 AS days_on_hand FROM inventory_metrics WHERE quarter = 'Q3/2026' GROUP BY category_name;",
                steps=[
                    ReplayStepDetail(
                        id="step_inv_1_1",
                        stepIndex=0,
                        title="Tính toán Chỉ số Vòng quay Tồn kho Toàn chuỗi",
                        phase="query",
                        status="completed",
                        agentId="sql_analyst",
                        agentName="SQL Data Analyst",
                        agentType="sql_analyst",
                        startTimeMs=0,
                        endTimeMs=2200,
                        durationMs=2200,
                        summary="Truy vấn dữ liệu chi phí giá vốn (COGS) và giá trị tồn kho bình quân theo ngành hàng.",
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_inv_sql_1",
                                toolType="sql",
                                title="Truy vấn bảng inventory_metrics",
                                name="execute_sql",
                                status="success",
                                durationMs=1300,
                                input={"query": "SELECT category_name, SUM(cogs) as cogs, AVG(inventory_value) as inv_val FROM inventory_metrics GROUP BY category_name;"},
                                output={
                                    "rowCount": 3,
                                    "columns": ["category_name", "turnover", "doh"],
                                    "rows": [["Áo khoác Thu Đông", 4.8, 38], ["Trang phục thường ngày", 3.4, 52], ["Đồ lót & Phụ kiện", 2.1, 78]]
                                }
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="chart_inv_turnover",
                        artifactKind="chart",
                        title="Biểu đồ Vòng quay Tồn kho theo Ngành Hàng",
                        mimeType="application/json",
                        version=1,
                        content={"categories": ["Áo khoác", "Thường ngày", "Đồ lót"], "values": [4.8, 3.4, 2.1]},
                        createdAt="2026-08-22T07:15:20Z"
                    )
                ]
            ),
            ReplayTurnDetail(
                turnId="turn_inv_2",
                turnIndex=2,
                query="Liệt kê danh sách các mã SKU có mức tồn kho thấp hơn ngưỡng an toàn (Safety Stock) và dự kiến hết hàng trong 30 ngày?",
                createdAt="2026-08-22T07:18:00Z",
                finalResponse="### 🚨 Cảnh Báo 12 SKU Nguy Cơ Đứt Hàng (Stockout Risk < 20 ngày)\n\nĐã xác định **12 mã sản phẩm trọng điểm** đang có lượng tồn kho khả dụng dưới ngưỡng an toàn. Điển hình:\n- `SKU-JKT-004` (Áo phao lông vũ siêu nhẹ): Dự kiến đứt hàng trong **4.2 ngày**.\n- `SKU-SWT-012` (Áo len cổ lọ dệt kim): Dự kiến đứt hàng trong **7.5 ngày**.",
                sqlUsed="SELECT sku_code, product_name, current_stock, daily_run_rate, current_stock / daily_run_rate AS days_to_stockout, warehouse_location FROM sku_inventory WHERE (current_stock / daily_run_rate) < 20 ORDER BY days_to_stockout ASC LIMIT 15;",
                steps=[
                    ReplayStepDetail(
                        id="step_inv_2_1",
                        stepIndex=1,
                        title="Quét Nguy cơ Đứt gãy SKU & Tạo Bảng Điều chuyển",
                        phase="code",
                        status="completed",
                        agentId="data_engineer",
                        agentName="Data Quality & Anomaly Engineer",
                        agentType="data_engineer",
                        startTimeMs=0,
                        endTimeMs=3100,
                        durationMs=3100,
                        summary="Xác định 12 SKU báo động đỏ và tạo bảng dự báo tồn kho 30 ngày.",
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_inv_xlsx_1",
                                toolType="office",
                                title="Tạo bảng tính Excel Stockout Forecast",
                                name="export_excel_workbook",
                                status="success",
                                durationMs=1500,
                                input={"filename": "Stockout_Risk_Forecast_30D.xlsx"},
                                output={"status": "created", "download_url": "/api/v1/analyst/files/Stockout_Risk_Forecast_30D.xlsx"}
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="sheet_stockout_forecast",
                        artifactKind="sheet",
                        title="Bảng Dự Báo Nguy Cơ Đứt Hàng 30 Ngày",
                        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        version=1,
                        content={
                            "sheets": [
                                {
                                    "name": "Bao_Dong_Do",
                                    "headers": ["Mã SKU", "Tên sản phẩm", "Tồn kho", "Tốc độ bán/ngày", "Số ngày còn lại", "Vị trí kho"],
                                    "rows": [
                                        ["SKU-JKT-004", "Áo phao lông vũ siêu nhẹ", 420, 100, "4.2 ngày", "Kho Miền Nam"],
                                        ["SKU-SWT-012", "Áo len cổ lọ dệt kim", 600, 80, "7.5 ngày", "Kho Miền Bắc"],
                                        ["SKU-COAT-009", "Áo măng tô dạ ép", 310, 25, "12.4 ngày", "Kho Miền Bắc"]
                                    ]
                                }
                            ]
                        },
                        filePath="data/artifacts/Stockout_Risk_Forecast_30D.xlsx",
                        downloadUrl="/api/v1/analyst/files/Stockout_Risk_Forecast_30D.xlsx",
                        createdAt="2026-08-22T07:18:20Z"
                    )
                ]
            ),
            ReplayTurnDetail(
                turnId="turn_inv_3",
                turnIndex=3,
                query="Đề xuất lộ trình điều chuyển hàng tồn kho giữa Kho Miền Bắc và Kho Miền Nam và xuất slide trình bày.",
                createdAt="2026-08-22T07:22:00Z",
                finalResponse="### 🚛 Lộ Trình Tối Ưu Hóa & Điều Chuyển Hàng Liên Kho\n\nĐã lập kế hoạch điều chuyển **15,000 sản phẩm** từ Kho Miền Bắc (đang dư thừa 120 ngày tồn) sang Kho Miền Nam để cân đối nhu cầu và tránh thâm hụt cơ hội bán hàng ước tính **320,000 USD**.",
                steps=[
                    ReplayStepDetail(
                        id="step_inv_3_1",
                        stepIndex=2,
                        title="Khởi tạo Slide Thuyết trình Tối ưu Tồn kho",
                        phase="report",
                        status="completed",
                        agentId="office_writer",
                        agentName="Office Automation Specialist",
                        agentType="office_writer",
                        startTimeMs=0,
                        endTimeMs=3800,
                        durationMs=3800,
                        summary="Kết xuất bộ slide PPTX điều hành chuỗi cung ứng.",
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_inv_deck_1",
                                toolType="deck",
                                title="Tạo slide thuyết trình tối ưu tồn kho",
                                name="generate_presentation_deck",
                                status="success",
                                durationMs=1900,
                                input={"title": "Chiến Lược Cân Bằng Tồn Kho Chuỗi Cung Ứng 2026", "slide_count": 5},
                                output={"presentation_id": "deck_inv_opt_2026", "download_url": "/api/v1/analyst/deck/download/deck_inv_opt_2026.pptx"}
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="deck_inv_opt_2026",
                        artifactKind="slide",
                        title="Chiến Lược Cân Bằng & Tối Ưu Tồn Kho Chuỗi Cung Ứng",
                        mimeType="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        version=1,
                        slideCount=5,
                        content={
                            "title": "Chiến Lược Cân Bằng & Tối Ưu Tồn Kho Chuỗi Cung Ứng",
                            "theme": "tech_slate",
                            "slides": [
                                {
                                    "slideNumber": 1,
                                    "layoutType": "title",
                                    "title": "Chiến Lược Cân Bằng Tồn Kho Chuỗi Cung Ứng 2026",
                                    "subtitle": "Kế hoạch điều chuyển liên kho và bảo vệ 12 SKU trọng yếu khỏi nguy cơ đứt hàng"
                                },
                                {
                                    "slideNumber": 2,
                                    "layoutType": "metric_cards",
                                    "title": "Chỉ Số Tồn Kho & Cung Ứng",
                                    "kpis": [
                                        {"label": "Vòng quay TB (Turnover)", "value": 4.8, "formatted": "4.8x", "color": "emerald"},
                                        {"label": "Số ngày tồn kho (DOH)", "value": 38, "formatted": "38 ngày", "color": "navy"},
                                        {"label": "SKU Cảnh Báo Đỏ", "value": 12, "formatted": "12 SKU", "color": "amber"}
                                    ]
                                },
                                {
                                    "slideNumber": 3,
                                    "layoutType": "comparison",
                                    "title": "Cân Bằng Tồn Kho Bắc vs Nam",
                                    "columns": [
                                        {"header": "Kho Miền Bắc (Dư thừa)", "badge": "DƯ TỒN", "bullets": ["Tồn kho bình quân: 120 ngày", "Tốc độ tiêu thụ: 450 đơn/ngày"]},
                                        {"header": "Kho Miền Nam (Thiếu hụt)", "badge": "CẢNH BÁO", "bullets": ["Tồn kho chỉ còn: 14 ngày", "Tốc độ tiêu thụ: 820 đơn/ngày"]}
                                    ]
                                },
                                {
                                    "slideNumber": 4,
                                    "layoutType": "takeaway",
                                    "title": "Lộ Trình Điều Chuyển Hàng Khẩn Cấp",
                                    "takeaways": [
                                        {"priority": "01", "title": "Điều chuyển đợt 1 (3 ngày)", "description": "Vận chuyển 15,000 áo khoác lông vũ từ Kho Bắc vào Kho Nam."},
                                        {"priority": "02", "title": "Tăng cường Safety Stock", "description": "Nâng ngưỡng tồn kho an toàn từ 15 ngày lên 25 ngày."}
                                    ]
                                }
                            ]
                        },
                        filePath="data/artifacts/Inventory_Optimization_Deck.pptx",
                        downloadUrl="/api/v1/analyst/deck/download/deck_inv_opt_2026.pptx",
                        createdAt="2026-08-22T07:22:20Z"
                    )
                ]
            )
        ]
    )


# ═══════════════════════════════════════════════════════════════════════════
# Seed Trace 3: customer-churn-cohort (3 Turns)
# ═══════════════════════════════════════════════════════════════════════════

def _create_customer_churn_trace() -> ReplaySessionDetail:
    """Customer RFM segmentation and cohort retention analysis trace."""
    return ReplaySessionDetail(
        sessionId="customer-churn-cohort",
        title="Phân Khúc Khách Hàng RFM & Dự Báo Tỷ Lệ Rời Bỏ (Customer Churn Risk)",
        subtitle="Mô hình hóa RFM, đánh giá đường cong Cohort Retention và chiến dịch Win-Back cho khách VIP",
        mode="deep-research",
        badge="Customer Analytics",
        description="Xác định 22.5% người dùng nhóm At-Risk và xây dựng giải pháp bảo toàn $3.8M doanh thu định kỳ.",
        author="DB-GPT Growth & Retention Lab",
        createdAt="2026-08-22T06:30:00Z",
        updatedAt="2026-08-22T06:45:12Z",
        status="completed",
        totalDurationMs=19500,
        userPrompt="Phân tích hành vi khách hàng theo mô hình RFM (Recency, Frequency, Monetary), đánh giá tỷ lệ giữ chân theo cohort khách hàng 2025-2026, và đề xuất chiến dịch win-back.",
        model="deepseek-v4-flash",
        tags=["Customer", "RFM", "Cohort Retention", "Churn", "Win-Back", "Strategy"],
        theme={
            "palette": "warm_amber",
            "accent": "#D97706",
            "ink": "#1C1917",
            "background": "#FFFBEB",
        },
        turns=[
            ReplayTurnDetail(
                turnId="turn_churn_1",
                turnIndex=1,
                query="Tính toán điểm RFM và phân bổ khách hàng thành các phân khúc chính (Champions, Loyal, At Risk, Hibernating)?",
                createdAt="2026-08-22T06:30:05Z",
                finalResponse="### 👥 Phân Khúc Khách Hàng Theo Mô Hình RFM\n\n1. **Champions (Khách hàng Tinh hoa)**: Chiếm **14.2%** tệp người dùng nhưng đóng góp **48.6%** tổng doanh thu (Chi tiêu TB: 1,420 USD/năm).\n2. **At-Risk (Nguy cơ rời bỏ cao)**: Chiếm **22.5%** người dùng (khoảng 31,400 khách hàng), tương đương **3.8M USD** doanh thu có rủi ro bị mất mát.",
                sqlUsed="SELECT rfm_segment, COUNT(customer_id) AS customer_count, AVG(monetary_value) AS avg_spend, SUM(monetary_value) AS total_segment_revenue FROM customer_rfm_scores GROUP BY rfm_segment ORDER BY total_segment_revenue DESC;",
                steps=[
                    ReplayStepDetail(
                        id="step_churn_1_1",
                        stepIndex=0,
                        title="Tính toán Điểm số RFM & Phân cụm Khách hàng",
                        phase="query",
                        status="completed",
                        agentId="sql_analyst",
                        agentName="SQL Data Analyst",
                        agentType="sql_analyst",
                        startTimeMs=0,
                        endTimeMs=2400,
                        durationMs=2400,
                        summary="Chạy thuật toán phân cụm RFM trên 140,000 hồ sơ khách hàng tích lũy.",
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_churn_sql_1",
                                toolType="sql",
                                title="Truy vấn bảng customer_rfm_scores",
                                name="execute_sql",
                                status="success",
                                durationMs=1500,
                                input={"query": "SELECT rfm_segment, count(customer_id), sum(monetary_value) FROM customer_rfm_scores GROUP BY rfm_segment;"},
                                output={
                                    "rowCount": 4,
                                    "columns": ["rfm_segment", "customer_count", "total_rev"],
                                    "rows": [["Champions", 19880, 28229600], ["Loyal Customers", 44800, 18500000], ["At Risk", 31500, 3800000], ["Hibernating", 43820, 2100000]]
                                }
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="chart_rfm_pie",
                        artifactKind="chart",
                        title="Biểu đồ Phân bổ Doanh thu theo Phân khúc RFM",
                        mimeType="application/json",
                        version=1,
                        content={"categories": ["Champions", "Loyal", "At Risk", "Hibernating"], "values": [48.6, 31.8, 12.5, 7.1]},
                        createdAt="2026-08-22T06:30:20Z"
                    )
                ]
            ),
            ReplayTurnDetail(
                turnId="turn_churn_2",
                turnIndex=2,
                query="Vẽ đường cong tỷ lệ giữ chân (Retention Rate) qua 12 tháng của các cohort khách hàng mới đăng ký năm 2025?",
                createdAt="2026-08-22T06:34:00Z",
                finalResponse="### 📉 Phân Tích Đường Cong Cohort Retention\n\n- **Tháng 1 (M1)**: Tỷ lệ quay lại mua hàng đạt **42.0%**.\n- **Tháng 3 (M3)**: Giảm xuống **24.5%**.\n- **Tháng 6 (M6)**: Ổn định ở mức **18.2%**.\n- **Tháng 12 (M12)**: Tỷ lệ giữ chân cuối năm đạt **14.8%**.",
                sqlUsed="SELECT cohort_month, month_number, active_users, active_users::float / first_month_users AS retention_rate FROM cohort_retention_table WHERE cohort_year = 2025 ORDER BY cohort_month, month_number;",
                steps=[
                    ReplayStepDetail(
                        id="step_churn_2_1",
                        stepIndex=1,
                        title="Xây dựng Ma trận Cohort Retention Matrix",
                        phase="report",
                        status="completed",
                        agentId="office_writer",
                        agentName="Office Automation Specialist",
                        agentType="office_writer",
                        startTimeMs=0,
                        endTimeMs=2800,
                        durationMs=2800,
                        summary="Tạo bảng tính Excel Cohort_Retention_Matrix.xlsx phân tích retention qua 12 chu kỳ.",
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_churn_xlsx_1",
                                toolType="office",
                                title="Tạo file Excel Cohort Retention",
                                name="export_excel_workbook",
                                status="success",
                                durationMs=1400,
                                input={"filename": "Cohort_Retention_Matrix.xlsx"},
                                output={"status": "created", "download_url": "/api/v1/analyst/files/Cohort_Retention_Matrix.xlsx"}
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="sheet_cohort_matrix",
                        artifactKind="sheet",
                        title="Ma Trận Giữ Chân Khách Hàng (Cohort Retention Matrix)",
                        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        version=1,
                        content={
                            "sheets": [
                                {
                                    "name": "Retention_Rate",
                                    "headers": ["Cohort", "M0 (Đăng ký)", "M1", "M3", "M6", "M12"],
                                    "rows": [
                                        ["Jan 2025", "100%", "42.5%", "25.1%", "18.6%", "15.2%"],
                                        ["Feb 2025", "100%", "41.8%", "24.2%", "17.9%", "14.6%"],
                                        ["Mar 2025", "100%", "43.0%", "26.0%", "19.1%", "15.8%"]
                                    ]
                                }
                            ]
                        },
                        filePath="data/artifacts/Cohort_Retention_Matrix.xlsx",
                        downloadUrl="/api/v1/analyst/files/Cohort_Retention_Matrix.xlsx",
                        createdAt="2026-08-22T06:34:20Z"
                    )
                ]
            ),
            ReplayTurnDetail(
                turnId="turn_churn_3",
                turnIndex=3,
                query="Đề xuất chiến lược kích hoạt lại khách hàng VIP và xuất thành bộ slide báo cáo.",
                createdAt="2026-08-22T06:38:00Z",
                finalResponse="### 🚀 Chiến Lược Kích Hoạt Lại (Win-Back Campaign) & Xuất Slide\n\nĐã lập chiến lược 3 mũi nhọn: Personalized Voucher cá nhân hóa, Tri ân thành viên VIP Birthday Month, và Tương tác qua Zalo/App Notification tự động.",
                steps=[
                    ReplayStepDetail(
                        id="step_churn_3_1",
                        stepIndex=2,
                        title="Khởi tạo Slide Thuyết trình & Whitepaper Chiến lược",
                        phase="report",
                        status="completed",
                        agentId="office_writer",
                        agentName="Office Automation Specialist",
                        agentType="office_writer",
                        startTimeMs=0,
                        endTimeMs=4100,
                        durationMs=4100,
                        summary="Kết xuất bộ slide Customer_Retention_Strategy_Deck.pptx.",
                        toolCalls=[
                            ReplayToolCall(
                                id="tool_churn_deck_1",
                                toolType="deck",
                                title="Tạo slide thuyết trình giữ chân khách hàng",
                                name="generate_presentation_deck",
                                status="success",
                                durationMs=2100,
                                input={"title": "Chiến Lược Giữ Chân & Kích Hoạt Khách Hàng 2026", "slide_count": 5},
                                output={"presentation_id": "deck_churn_2026", "download_url": "/api/v1/analyst/deck/download/deck_churn_2026.pptx"}
                            )
                        ]
                    )
                ],
                artifacts=[
                    ReplayArtifactDetail(
                        artifactId="deck_churn_2026",
                        artifactKind="slide",
                        title="Chiến Lược Giữ Chân & Kích Hoạt Lại Khách Hàng",
                        mimeType="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        version=1,
                        slideCount=5,
                        content={
                            "title": "Chiến Lược Giữ Chân & Kích Hoạt Lại Khách Hàng",
                            "theme": "warm_amber",
                            "slides": [
                                {
                                    "slideNumber": 1,
                                    "layoutType": "title",
                                    "title": "Chiến Lược Giữ Chân & Kích Hoạt Lại Khách Hàng 2026",
                                    "subtitle": "Phân khúc RFM và giải pháp bảo toàn 3.8M USD doanh thu nhóm khách hàng At-Risk"
                                },
                                {
                                    "slideNumber": 2,
                                    "layoutType": "metric_cards",
                                    "title": "Chỉ Số Sức Khỏe Tệp Khách Hàng",
                                    "kpis": [
                                        {"label": "Champions (Doanh thu)", "value": 48.6, "formatted": "48.6%", "color": "emerald"},
                                        {"label": "Khách hàng At-Risk", "value": 31400, "formatted": "31,400 user", "color": "amber"},
                                        {"label": "Retention M12", "value": 14.8, "formatted": "14.8%", "color": "navy"}
                                    ]
                                },
                                {
                                    "slideNumber": 3,
                                    "layoutType": "takeaway",
                                    "title": "Kế Hoạch Chiến Dịch Win-Back",
                                    "takeaways": [
                                        {"priority": "01", "title": "Cá nhân hóa Voucher Ưu đãi", "description": "Tặng voucher 20% giảm giá cho nhóm Champions không phát sinh đơn trong 60 ngày."},
                                        {"priority": "02", "title": "Chăm sóc qua Kênh Riêng", "description": "Đội ngũ chuyên viên tư vấn gọi điện trực tiếp khảo sát ý kiến khách hàng VIP."}
                                    ]
                                }
                            ]
                        },
                        filePath="data/artifacts/Customer_Retention_Strategy_Deck.pptx",
                        downloadUrl="/api/v1/analyst/deck/download/deck_churn_2026.pptx",
                        createdAt="2026-08-22T06:38:20Z"
                    )
                ]
            )
        ]
    )


# ═══════════════════════════════════════════════════════════════════════════
# Seed Registry & Replay Session Repository
# ═══════════════════════════════════════════════════════════════════════════

SEED_REPLAY_SESSIONS: Dict[str, ReplaySessionDetail] = {
    "canifa-sales-q3-deepdive": _create_canifa_sales_trace(),
    "inventory-stockout-forecast": _create_inventory_trace(),
    "customer-churn-cohort": _create_customer_churn_trace(),
}


class ReplaySessionRepository:
    """Thread-safe in-memory and file-backed repository for Replay Sessions."""

    def __init__(self, seed_dir: Optional[Path] = None):
        self.seed_dir = seed_dir or Path("data/seed_traces")
        self._sessions: Dict[str, ReplaySessionDetail] = {}
        self._load_seeds()

    def _load_seeds(self) -> None:
        """Initialize with seed traces and scan disk for persistent JSON files."""
        # 1. Load built-in enterprise seeds
        for sid, trace in SEED_REPLAY_SESSIONS.items():
            self._sessions[sid] = trace

        # 2. Load disk backups if available
        if self.seed_dir.exists():
            for json_file in self.seed_dir.glob("*.json"):
                try:
                    data = json.loads(json_file.read_text(encoding="utf-8"))
                    session = ReplaySessionDetail.model_validate(data)
                    self._sessions[session.session_id] = session
                    logger.info(f"Loaded persisted replay session from disk: {session.session_id}")
                except Exception as exc:
                    logger.warning(f"Could not load seed JSON from {json_file}: {exc}")

    def list_sessions(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        status: Optional[str] = None,
        artifact_kind: Optional[str] = None,
        model: Optional[str] = None,
    ) -> ReplaySessionListResponse:
        """Return paginated session summaries matching query filters."""
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 20
        if page_size > 100:
            page_size = 100

        all_sessions = list(self._sessions.values())
        # Sort by updated_at descending
        all_sessions.sort(key=lambda s: s.updated_at, reverse=True)

        filtered = []
        for s in all_sessions:
            if status and status.lower() not in ("all", "") and s.status.lower() != status.lower():
                continue
            if model and s.model != model:
                continue
            if search:
                q = search.lower()
                matches_title = q in s.title.lower()
                matches_prompt = q in s.user_prompt.lower()
                matches_tags = any(q in t.lower() for t in s.tags)
                if not (matches_title or matches_prompt or matches_tags):
                    continue
            if artifact_kind:
                has_kind = any(
                    any(a.artifact_kind.lower() == artifact_kind.lower() for a in turn.artifacts)
                    for turn in s.turns
                )
                if not has_kind:
                    continue
            filtered.append(s)

        total = len(filtered)
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        start = (page - 1) * page_size
        paged_items = filtered[start : start + page_size]

        summaries = []
        for s in paged_items:
            # Count total steps and artifacts across turns
            total_steps = sum(len(turn.steps) for turn in s.turns)
            all_artifacts = [art for turn in s.turns for art in turn.artifacts]
            artifact_count = len(all_artifacts)

            # Extract distinct preview tags from artifact kinds + manual tags
            preview_tags = list(s.tags[:3])
            for art in all_artifacts:
                if art.artifact_kind == "slide" and "16:9 Slides" not in preview_tags:
                    preview_tags.append("16:9 Slides")
                elif art.artifact_kind == "sheet" and "Excel" not in preview_tags:
                    preview_tags.append("Excel")
                elif art.artifact_kind == "doc" and "Word DOCX" not in preview_tags:
                    preview_tags.append("Word DOCX")

            summaries.append(
                ReplaySessionSummary(
                    sessionId=s.session_id,
                    title=s.title,
                    userQuery=s.user_prompt,
                    status=s.status,
                    createdAt=s.created_at,
                    updatedAt=s.updated_at,
                    totalTurns=len(s.turns),
                    totalSteps=total_steps,
                    artifactCount=artifact_count,
                    previewTags=preview_tags,
                    durationMs=s.total_duration_ms,
                    model=s.model,
                    mode=s.mode,
                )
            )

        return ReplaySessionListResponse(
            code=0,
            message="success",
            data=ReplaySessionListEnvelope(
                total=total,
                page=page,
                pageSize=page_size,
                totalPages=total_pages,
                items=summaries,
            ),
        )

    def get_session(self, session_id: str) -> Optional[ReplaySessionDetail]:
        """Lookup session detail by session_id."""
        return self._sessions.get(session_id)

    def save_session(self, session: ReplaySessionDetail) -> None:
        """Register or update a session trace."""
        self._sessions[session.session_id] = session
        try:
            self.seed_dir.mkdir(parents=True, exist_ok=True)
            target = self.seed_dir / f"{session.session_id}.json"
            target.write_text(session.model_dump_json(indent=2, by_alias=True), encoding="utf-8")
        except Exception as exc:
            logger.warning(f"Could not persist session {session.session_id} to disk: {exc}")

    def get_session_events(self, session_id: str) -> List[Dict[str, Any]]:
        """Deconstruct session trace into an ordered sequence of SSE wire events."""
        session = self.get_session(session_id)
        if not session:
            return []

        events: List[Dict[str, Any]] = []

        total_steps = sum(len(turn.steps) for turn in session.turns)
        total_artifacts = sum(len(turn.artifacts) for turn in session.turns)

        # 1. session_start
        events.append({
            "event": "session_start",
            "data": {
                "session_id": session.session_id,
                "title": session.title,
                "model": session.model,
                "created_at": session.created_at,
                "total_turns": len(session.turns),
                "total_steps": total_steps,
            },
        })

        # 2. Iterate through turns
        for turn in session.turns:
            events.append({
                "event": "turn_start",
                "data": {
                    "turn_id": turn.turn_id,
                    "turn_index": turn.turn_index,
                    "query": turn.query,
                },
            })

            # Iterate through steps in turn
            for step in turn.steps:
                events.append({
                    "event": "step_start",
                    "data": {
                        "step_id": step.id,
                        "step_index": step.step_index,
                        "phase": step.phase,
                        "title": step.title,
                        "agent_type": step.agent_type,
                        "agent_name": step.agent_name,
                    },
                })

                # Stream thinking delta chunks if available
                if step.thinking and step.thinking.content:
                    # Break into realistic chunks
                    content = step.thinking.content
                    chunk_size = 60
                    chunks = [content[i : i + chunk_size] for i in range(0, len(content), chunk_size)]
                    for idx, chunk in enumerate(chunks):
                        events.append({
                            "event": "thought_chunk",
                            "data": {
                                "step_id": step.id,
                                "thought_id": f"{step.thinking.id}_{idx}",
                                "delta": chunk,
                                "is_first_chunk": idx == 0,
                                "is_last_chunk": idx == len(chunks) - 1,
                            },
                        })

                # Stream tool calls and results
                for tool in step.tool_calls:
                    events.append({
                        "event": "tool_call",
                        "data": {
                            "id": tool.id,
                            "step_id": step.id,
                            "tool_type": tool.tool_type,
                            "name": tool.name or tool.title,
                            "arguments": tool.input,
                        },
                    })

                    events.append({
                        "event": "tool_result",
                        "data": {
                            "tool_call_id": tool.id,
                            "name": tool.name or tool.title,
                            "status": tool.status,
                            "duration_ms": tool.duration_ms,
                            "return_value": tool.output,
                            "error_message": tool.error_message,
                        },
                    })

            # Stream artifacts created in this turn
            for art in turn.artifacts:
                events.append({
                    "event": "artifact_created",
                    "data": {
                        "artifact_id": art.artifact_id,
                        "artifact_kind": art.artifact_kind,
                        "title": art.title,
                        "patch": {
                            "action": "create",
                            "mime_type": art.mime_type,
                            "download_url": art.download_url,
                            "slide_count": art.slide_count,
                            "content": art.content,
                        },
                    },
                })

            # Turn end
            events.append({
                "event": "turn_end",
                "data": {
                    "turn_id": turn.turn_id,
                    "outcome": "success",
                    "total_tokens": 1250,
                    "duration_ms": 4500,
                    "final_response": turn.final_response,
                },
            })

        # 3. session_end
        events.append({
            "event": "session_end",
            "data": {
                "session_id": session.session_id,
                "status": session.status,
                "total_turns": len(session.turns),
                "total_steps": total_steps,
                "total_artifacts": total_artifacts,
            },
        })

        return events

    async def stream_session_events(
        self, session_id: str, speed: float = 1.0
    ) -> AsyncGenerator[str, None]:
        """Stream replay session step-by-step as SSE frames."""
        session = self.get_session(session_id)
        if not session:
            err_data = json.dumps({"code": "SESSION_NOT_FOUND", "message": f"Session not found: {session_id}"}, ensure_ascii=False)
            yield f"event: error\ndata: {err_data}\n\n"
            return

        events = self.get_session_events(session_id)
        for ev in events:
            ev_name = ev.get("event", "message")
            ev_data = json.dumps(ev.get("data", {}), ensure_ascii=False)
            yield f"event: {ev_name}\ndata: {ev_data}\n\n"

            if speed > 0:
                # Dynamic pacing based on event type
                base_delay = 0.02
                if ev_name == "thought_chunk":
                    base_delay = 0.015
                elif ev_name in ("tool_call", "step_start"):
                    base_delay = 0.04
                elif ev_name in ("tool_result", "artifact_created"):
                    base_delay = 0.03
                elif ev_name in ("turn_start", "turn_end"):
                    base_delay = 0.05

                sleep_time = base_delay / max(speed, 0.1)
                try:
                    await asyncio.sleep(min(sleep_time, 0.5))
                except asyncio.CancelledError:
                    logger.info(f"Replay stream for session {session_id} canceled by client.")
                    break


# Singleton global repository instance
_global_replay_repo = ReplaySessionRepository()


def get_replay_repository() -> ReplaySessionRepository:
    """Get the global singleton ReplaySessionRepository instance."""
    return _global_replay_repo
