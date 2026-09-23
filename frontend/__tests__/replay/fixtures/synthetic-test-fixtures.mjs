/**
 * Mock Replay Sessions for Kimi-style Agent Replay & Playback Engine
 * Derived from PROJECT.md, survey_spec.md, and survey_data_sync.md
 */

export const MOCK_STRATEGY_DECK_SESSION = {
  id: 'replay_strategy_deck_169',
  title: 'Báo Cáo Chiến Lược & Tối Ưu Hóa Vận Hành Doanh Nghiệp 2026-2028',
  subtitle: 'Khung Chuyển Đổi Số Toàn Diện & Tự Động Hóa Bằng AI Tự Hành (Trình HĐQT)',
  mode: 'slides',
  badge: 'Executive • 16:9 • Boardroom',
  description: 'Replay phiên tạo bài thuyết trình 6 slide chiến lược chuyển đổi số doanh nghiệp với dữ liệu KPI tài chính và ma trận cạnh tranh.',
  author: 'DB-GPT Strategy Lab',
  createdAt: '2026-08-22T08:00:00Z',
  totalDurationMs: 18000,
  userPrompt: 'Tạo bài thuyết trình Chiến lược Chuyển đổi số & Tối ưu hóa Vận hành Doanh nghiệp (Executive Strategy) trình bày trước Hội đồng Quản trị với 6 slide phân tích chuyên sâu.',
  tags: ['Strategy', 'Slides', 'Executive', 'Boardroom', 'Transformation'],
  theme: {
    bg: '#0f172a',
    fg: '#f8fafc',
    accent: '#f59e0b',
    secondary: '#38bdf8',
  },
  steps: [
    {
      stepIndex: 0,
      id: 'step-1-intent',
      title: 'Bước 1: Phân tích đề bài & Lập dàn ý 6 slide',
      phase: 'intent',
      status: 'completed',
      startTimeMs: 0,
      endTimeMs: 3500,
      durationMs: 3500,
      summary: 'Phân tích yêu cầu bài thuyết trình cho Hội đồng Quản trị và cấu trúc hóa dàn ý 6 slide chuyên nghiệp.',
      thinking: {
        id: 'think-1',
        title: 'Lập kế hoạch phân rã 6 slide chiến lược',
        tokens: 420,
        elapsedMs: 3400,
        content: 'Cần thiết kế bài thuyết trình 6 slide theo chuẩn 16:9 Executive Boardroom. Slide 1: Cover, Slide 2: KPI Dashboard, Slide 3: Trụ cột chuyển đổi số, Slide 4: Ma trận so sánh thị trường, Slide 5: Lộ trình 4 quý, Slide 6: Kiến nghị & Ký duyệt.',
        subThoughtItems: [
          { id: 'st-1-1', text: 'Xác định đối tượng người nghe: Hội đồng Quản trị & Ban Tổng Giám đốc', state: 'completed', durationMs: 1100 },
          { id: 'st-1-2', text: 'Phân rã luồng trình bày từ bức tranh tổng quan đến chi tiết hành động', state: 'completed', durationMs: 1200 },
          { id: 'st-1-3', text: 'Khởi tạo template 16:9 với tone màu Navy & Amber uy tín', state: 'completed', durationMs: 1100 }
        ],
        keyDecisions: ['Sử dụng tỷ lệ khung hình 16:9', 'Tối ưu độ tương phản văn bản chuẩn WCAG AAA']
      },
      toolCalls: [],
      artifactPatch: {
        mode: 'slides',
        action: 'init',
        slideDelta: {
          activeSlideIndex: 0,
          totalSlideCount: 1,
          deckTitle: 'Chiến Lược Chuyển Đổi Số Doanh Nghiệp 2026-2028',
          slidesToAdd: [
            {
              id: 'slide-1',
              slideNumber: 1,
              layout: 'hero',
              title: 'CHIẾN LƯỢC CHUYỂN ĐỔI SỐ TOÀN DIỆN 2026 - 2028',
              subtitle: 'Kiến Tạo Lợi Thế Cạnh Tranh Bằng Trí Tuệ Nhân Tạo & Nền Tảng Dữ Liệu Hợp Nhất',
              author: 'Ban Chiến Lược Công Nghệ & Vận Hành DB-GPT',
              date: 'Tháng 8 / 2026',
              badge: 'Báo Cáo Mật HĐQT'
            }
          ]
        }
      },
      projectedArtifactSnapshot: {
        totalSlides: 1,
        activeSlideIndex: 0,
        slides: [
          { id: 'slide-1', title: 'CHIẾN LƯỢC CHUYỂN ĐỔI SỐ TOÀN DIỆN 2026 - 2028', layout: 'hero' }
        ]
      }
    },
    {
      stepIndex: 1,
      id: 'step-2-sql-data',
      title: 'Bước 2: Khai thác dữ liệu SQL & Tính toán KPI',
      phase: 'query',
      status: 'completed',
      startTimeMs: 3500,
      endTimeMs: 7500,
      durationMs: 4000,
      summary: 'Truy vấn kho dữ liệu doanh nghiệp, tổng hợp các chỉ số tăng trưởng doanh thu, biên lợi nhuận EBITDA và chỉ số CSAT.',
      thinking: {
        id: 'think-2',
        title: 'Truy vấn Data Warehouse và tính toán 4 chỉ số cốt lõi',
        tokens: 680,
        elapsedMs: 3800,
        content: 'Chạy câu lệnh SQL phân tích chỉ số kinh doanh 2024-2026. Lấy 4 metric nổi bật: Tăng trưởng doanh thu 28.4%, EBITDA 31.2%, CSAT 4.8/5, Độ ổn định SLA 99.98%.',
        subThoughtItems: [
          { id: 'st-2-1', text: 'Kết nối kho dữ liệu Snowflake/ClickHouse qua DB-GPT connector', state: 'completed', durationMs: 900 },
          { id: 'st-2-2', text: 'Thực thi câu truy vấn SQL tổng hợp số liệu 3 năm', state: 'completed', durationMs: 1800 },
          { id: 'st-2-3', text: 'Định dạng dữ liệu thành lưới 4 chỉ số KPI ấn tượng cho Slide 2', state: 'completed', durationMs: 1100 }
        ]
      },
      toolCalls: [
        {
          id: 'tool-sql-1',
          toolType: 'sql',
          title: 'Truy vấn kho dữ liệu DW_Corporate_Metrics',
          status: 'success',
          durationMs: 1720,
          input: {
            query: 'SELECT year, rev_growth, ebitda_margin, csat, sla_percent FROM enterprise_metrics WHERE year >= 2024 ORDER BY year DESC;',
            datasource: 'production_warehouse'
          },
          output: {
            rowCount: 3,
            columns: ['year', 'rev_growth', 'ebitda_margin', 'csat', 'sla_percent'],
            rows: [
              ['2026 (YTD)', '28.4%', '31.2%', '4.82', '99.98%'],
              ['2025', '22.1%', '28.5%', '4.65', '99.95%'],
              ['2024', '18.7%', '24.0%', '4.50', '99.90%']
            ]
          }
        }
      ],
      artifactPatch: {
        mode: 'slides',
        action: 'append',
        slideDelta: {
          activeSlideIndex: 1,
          totalSlideCount: 2,
          slidesToAdd: [
            {
              id: 'slide-2',
              slideNumber: 2,
              layout: 'stat_grid',
              title: 'BỨC TRANH HIỆU QUẢ TÀI CHÍNH & VẬN HÀNH DOANH NGHIỆP',
              subtitle: 'Dữ liệu thực tế tổng hợp từ hệ thống kho dữ liệu trung tâm YTD 2026',
              stats: [
                { label: 'TĂNG TRƯỞNG DOANH THU', value: '+28.4%', trend: '+6.3% YoY', color: 'emerald' },
                { label: 'BIÊN LỢI NHUẬN EBITDA', value: '31.2%', trend: '+2.7% YoY', color: 'blue' },
                { label: 'HÀI LÒNG KHÁCH HÀNG (CSAT)', value: '4.82 / 5', trend: '+0.17 pts', color: 'amber' },
                { label: 'ĐỘ SẴN SÀNG HỆ THỐNG SLA', value: '99.98%', trend: 'Top Tier 1', color: 'indigo' }
              ]
            }
          ]
        }
      },
      projectedArtifactSnapshot: {
        totalSlides: 2,
        activeSlideIndex: 1,
        slides: [
          { id: 'slide-1', title: 'CHIẾN LƯỢC CHUYỂN ĐỔI SỐ TOÀN DIỆN 2026 - 2028', layout: 'hero' },
          { id: 'slide-2', title: 'BỨC TRANH HIỆU QUẢ TÀI CHÍNH & VẬN HÀNH DOANH NGHIỆP', layout: 'stat_grid' }
        ]
      }
    },
    {
      stepIndex: 2,
      id: 'step-3-pillars-matrix',
      title: 'Bước 3: Xây dựng trụ cột chiến lược & Ma trận cạnh tranh',
      phase: 'code',
      status: 'completed',
      startTimeMs: 7500,
      endTimeMs: 11500,
      durationMs: 4000,
      summary: 'Xác lập 3 trụ cột công nghệ cốt lõi và dựng ma trận so sánh năng lực cạnh tranh với các đối thủ cùng phân khúc.',
      thinking: {
        id: 'think-3',
        title: 'Mô hình hóa 3 trụ cột và bảng so sánh năng lực',
        tokens: 850,
        elapsedMs: 3900,
        content: 'Thiết kế Slide 3 với 3 trụ cột: 1. Nền tảng Dữ liệu Hợp nhất, 2. AI Multi-Agent Tự hành, 3. Tối ưu Quy trình Tự động. Thiết kế Slide 4 với ma trận đánh giá đối thủ cạnh tranh.',
        subThoughtItems: [
          { id: 'st-3-1', text: 'Tổng hợp 3 trụ cột kiến trúc chuyển đổi', state: 'completed', durationMs: 1300 },
          { id: 'st-3-2', text: 'Dựng bảng ma trận 4 tiêu chí đánh giá thị trường', state: 'completed', durationMs: 1400 },
          { id: 'st-3-3', text: 'Sinh cấu trúc Slide 3 & Slide 4', state: 'completed', durationMs: 1200 }
        ]
      },
      toolCalls: [],
      artifactPatch: {
        mode: 'slides',
        action: 'append',
        slideDelta: {
          activeSlideIndex: 2,
          totalSlideCount: 4,
          slidesToAdd: [
            {
              id: 'slide-3',
              slideNumber: 3,
              layout: 'two_col',
              title: '3 TRỤ CỘT CHIẾN LƯỢC ĐỘT PHÁ CÔNG NGHỆ 2026',
              subtitle: 'Đòn bẩy nâng cao năng suất và cá nhân hóa trải nghiệm khách hàng',
              leftCol: {
                title: 'Trụ Cột 1: Nền Tảng Dữ Liệu Lakehouse Hợp Nhất',
                description: 'Tích hợp toàn bộ dữ liệu ERP, CRM, E-Commerce vào một kho dữ liệu duy nhất với độ trễ < 5 giây.'
              },
              rightCol: {
                title: 'Trụ Cột 2 & 3: AI Multi-Agent & Vận Hành Tự Động',
                description: 'Triển khai mạng lưới AI Agent chuyên biệt tự động hóa 70% quy trình phê duyệt và chăm sóc khách hàng.'
              }
            },
            {
              id: 'slide-4',
              slideNumber: 4,
              layout: 'comparison',
              title: 'MA TRẬN NĂNG LỰC CẠNH TRANH THỊ TRƯỜNG',
              subtitle: 'Đánh giá vị thế công nghệ so với các đối thủ lớn trong khu vực',
              features: [
                { name: 'Khả năng phân tích Real-time', enterprise: 'Vượt trội (<5s)', competitorA: 'Trung bình (1h)', competitorB: 'Hạn chế (Daily)' },
                { name: 'Tự động hóa bằng AI Agent', enterprise: 'Có (Toàn diện)', competitorA: 'Thử nghiệm', competitorB: 'Chưa có' },
                { name: 'Chi phí vận hành OPEX/doanh thu', enterprise: 'Tối ưu (-25%)', competitorA: 'Cao', competitorB: 'Trung bình' }
              ]
            }
          ]
        }
      },
      projectedArtifactSnapshot: {
        totalSlides: 4,
        activeSlideIndex: 2,
        slides: [
          { id: 'slide-1', title: 'CHIẾN LƯỢC CHUYỂN ĐỔI SỐ TOÀN DIỆN 2026 - 2028', layout: 'hero' },
          { id: 'slide-2', title: 'BỨC TRANH HIỆU QUẢ TÀI CHÍNH & VẬN HÀNH DOANH NGHIỆP', layout: 'stat_grid' },
          { id: 'slide-3', title: '3 TRỤ CỘT CHIẾN LƯỢC ĐỘT PHÁ CÔNG NGHỆ 2026', layout: 'two_col' },
          { id: 'slide-4', title: 'MA TRẬN NĂNG LỰC CẠNH TRANH THỊ TRƯỜNG', layout: 'comparison' }
        ]
      }
    },
    {
      stepIndex: 3,
      id: 'step-4-roadmap-python',
      title: 'Bước 4: Lập lộ trình triển khai 4 quý 2026-2027',
      phase: 'code',
      status: 'completed',
      startTimeMs: 11500,
      endTimeMs: 15000,
      durationMs: 3500,
      summary: 'Dùng Python tính toán tiến độ, nguồn lực và sinh sơ đồ lộ trình thực hiện 4 quý (Q1 2026 - Q4 2026).',
      thinking: {
        id: 'think-4',
        title: 'Phân tích tài nguyên triển khai và sinh timeline 4 quý',
        tokens: 540,
        elapsedMs: 3300,
        content: 'Chạy mã Python tính toán phân bổ ngân sách và nhân sự theo từng quý để đảm bảo tiến độ không bị nghẽn.',
        subThoughtItems: [
          { id: 'st-4-1', text: 'Chạy Python simulation tính toán Gantt chart', state: 'completed', durationMs: 1200 },
          { id: 'st-4-2', text: 'Tạo Slide 5 dạng timeline roadmap 4 quý', state: 'completed', durationMs: 1100 }
        ]
      },
      toolCalls: [
        {
          id: 'tool-py-1',
          toolType: 'python',
          title: 'Tính toán phân bổ nguồn lực & timeline',
          status: 'success',
          durationMs: 1100,
          input: {
            code: 'quarters = ["Q1-2026", "Q2-2026", "Q3-2026", "Q4-2026"]\nmilestones = ["Hoàn thiện Data Lake", "Ra mắt AI Agent Pilot", "Mở rộng 10 Chi nhánh", "Tối ưu hóa toàn diện"]\nprint(dict(zip(quarters, milestones)))'
          },
          output: {
            stdout: "{'Q1-2026': 'Hoàn thiện Data Lake', 'Q2-2026': 'Ra mắt AI Agent Pilot', 'Q3-2026': 'Mở rộng 10 Chi nhánh', 'Q4-2026': 'Tối ưu hóa toàn diện'}"
          }
        }
      ],
      artifactPatch: {
        mode: 'slides',
        action: 'append',
        slideDelta: {
          activeSlideIndex: 4,
          totalSlideCount: 5,
          slidesToAdd: [
            {
              id: 'slide-5',
              slideNumber: 5,
              layout: 'timeline',
              title: 'LỘ TRÌNH TRIỂN KHAI CHI TIẾT 4 QUÝ NĂM 2026',
              subtitle: 'Kế hoạch hành động cụ thể và các mốc bàn giao nghiệm thu chính',
              milestones: [
                { period: 'Q1 / 2026', title: 'Xây Dựng Nền Móng Dữ Liệu', desc: 'Hợp nhất Data Warehouse, kết nối 100% dữ liệu chi nhánh.' },
                { period: 'Q2 / 2026', title: 'Thử Nghiệm AI Agent Trợ Lý', desc: 'Triển khai trợ lý nội bộ cho 200 nhân sự vận hành.' },
                { period: 'Q3 / 2026', title: 'Tự Động Hóa Đa Kênh', desc: 'Mở rộng hệ thống AI ra dịch vụ khách hàng 24/7.' },
                { period: 'Q4 / 2026', title: 'Đánh Giá & Tối Ưu Hóa ROI', desc: 'Nghiệm thu toàn diện và trình báo cáo tổng kết HĐQT.' }
              ]
            }
          ]
        }
      },
      projectedArtifactSnapshot: {
        totalSlides: 5,
        activeSlideIndex: 4,
        slides: [
          { id: 'slide-1', title: 'CHIẾN LƯỢC CHUYỂN ĐỔI SỐ TOÀN DIỆN 2026 - 2028', layout: 'hero' },
          { id: 'slide-2', title: 'BỨC TRANH HIỆU QUẢ TÀI CHÍNH & VẬN HÀNH DOANH NGHIỆP', layout: 'stat_grid' },
          { id: 'slide-3', title: '3 TRỤ CỘT CHIẾN LƯỢC ĐỘT PHÁ CÔNG NGHỆ 2026', layout: 'two_col' },
          { id: 'slide-4', title: 'MA TRẬN NĂNG LỰC CẠNH TRANH THỊ TRƯỜNG', layout: 'comparison' },
          { id: 'slide-5', title: 'LỘ TRÌNH TRIỂN KHAI CHI TIẾT 4 QUÝ NĂM 2026', layout: 'timeline' }
        ]
      }
    },
    {
      stepIndex: 4,
      id: 'step-5-synthesis-closing',
      title: 'Bước 5: Tổng hợp đề xuất & Phê duyệt HĐQT',
      phase: 'synthesis',
      status: 'completed',
      startTimeMs: 15000,
      endTimeMs: 18000,
      durationMs: 3000,
      summary: 'Hoàn thiện slide kết luận, tổng hợp chỉ số ROI kỳ vọng 3.4x và hoàn tất bộ bài thuyết trình 6 slide.',
      thinking: {
        id: 'think-5',
        title: 'Tổng kết khuyến nghị đầu tư và đề xuất biểu quyết HĐQT',
        tokens: 380,
        elapsedMs: 2900,
        content: 'Tổng hợp đề xuất: Ngân sách đầu tư 1.2M USD, thời gian hoàn vốn 14 tháng, ROI kỳ vọng 3.4x sau 2 năm. Sinh Slide 6 Call-to-action & Sign-off.',
        subThoughtItems: [
          { id: 'st-5-1', text: 'Tính toán chỉ số tài chính ROI & Thời gian hoàn vốn', state: 'completed', durationMs: 900 },
          { id: 'st-5-2', text: 'Tạo Slide 6 chốt phiên và kích hoạt export PPTX', state: 'completed', durationMs: 1100 }
        ]
      },
      toolCalls: [],
      artifactPatch: {
        mode: 'slides',
        action: 'finalize',
        slideDelta: {
          activeSlideIndex: 5,
          totalSlideCount: 6,
          slidesToAdd: [
            {
              id: 'slide-6',
              slideNumber: 6,
              layout: 'closing',
              title: 'KIẾN NGHỊ HỘI ĐỒNG QUẢN TRỊ PHÊ DUYỆT',
              subtitle: 'Cam kết tiến độ và hiệu quả sinh lời vững chắc cho doanh nghiệp',
              recommendation: 'Kính trình HĐQT thông qua chủ trương đầu tư dự án Chuyển đổi số Giai đoạn 1 với ngân sách 1.2M USD.',
              ctaText: 'BẮT ĐẦU TRIỂN KHAI',
              signOff: 'Trưởng Ban Dự Án: TS. Nguyễn Văn A — Cựu Kiến Trúc Sư Trưởng DB-GPT'
            }
          ]
        }
      },
      projectedArtifactSnapshot: {
        totalSlides: 6,
        activeSlideIndex: 5,
        slides: [
          { id: 'slide-1', title: 'CHIẾN LƯỢC CHUYỂN ĐỔI SỐ TOÀN DIỆN 2026 - 2028', layout: 'hero' },
          { id: 'slide-2', title: 'BỨC TRANH HIỆU QUẢ TÀI CHÍNH & VẬN HÀNH DOANH NGHIỆP', layout: 'stat_grid' },
          { id: 'slide-3', title: '3 TRỤ CỘT CHIẾN LƯỢC ĐỘT PHÁ CÔNG NGHỆ 2026', layout: 'two_col' },
          { id: 'slide-4', title: 'MA TRẬN NĂNG LỰC CẠNH TRANH THỊ TRƯỜNG', layout: 'comparison' },
          { id: 'slide-5', title: 'LỘ TRÌNH TRIỂN KHAI CHI TIẾT 4 QUÝ NĂM 2026', layout: 'timeline' },
          { id: 'slide-6', title: 'KIẾN NGHỊ HỘI ĐỒNG QUẢN TRỊ PHÊ DUYỆT', layout: 'closing' }
        ]
      }
    }
  ],
  forkContext: {
    model: 'dbgpt-kimi-agent',
    systemPrompt: 'Bạn là chuyên gia tư vấn chiến lược cấp cao hỗ trợ trả lời câu hỏi chuyên sâu về bài thuyết trình HĐQT.',
    initialMessages: [
      { role: 'user', content: 'Tạo bài thuyết trình Chiến lược Chuyển đổi số & Tối ưu hóa Vận hành Doanh nghiệp (Executive Strategy) trình bày trước Hội đồng Quản trị với 6 slide phân tích chuyên sâu.' },
      { role: 'assistant', content: 'Tôi đã tạo xong bộ bài thuyết trình 6 slide chiến lược chuyển đổi số hoàn chỉnh với đầy đủ phân tích KPI, ma trận cạnh tranh và lộ trình 4 quý.' }
    ],
    finalArtifact: {
      type: 'slides',
      title: 'Báo Cáo Chiến Lược & Tối Ưu Hóa Vận Hành Doanh Nghiệp 2026-2028',
      data: { totalSlides: 6, format: '16:9' }
    }
  }
};

export const MOCK_FINANCIAL_PNL_SESSION = {
  id: 'replay_financial_pnl_xlsx',
  title: 'Mô Hình Tài Chính PnL Hợp Nhất Đa Kênh & Dự Báo Dòng Tiền 3 Năm',
  subtitle: 'Bảng tính Excel Động với Phân Tích Kênh B2B, E-Commerce, SaaS & Stress Test',
  mode: 'sheets',
  badge: 'Finance • XLSX • Dynamic Formulas',
  description: 'Replay phiên phân tích sổ cái ERP và xây dựng bảng tính Excel 3 sheet với công thức động SUM/EBITDA và dự báo dòng tiền.',
  author: 'DB-GPT Financial Intelligence',
  createdAt: '2026-08-22T09:00:00Z',
  totalDurationMs: 20000,
  userPrompt: 'Xây dựng mô hình tài chính PnL hợp nhất đa kênh và dự báo dòng tiền 3 năm (2025-2027) bằng bảng tính Excel có công thức động.',
  tags: ['Finance', 'Excel', 'PnL', 'CashFlow', 'Forecast', 'Formulas'],
  theme: {
    bg: '#064e3b',
    fg: '#ecfdf5',
    accent: '#10b981',
    secondary: '#34d399',
  },
  steps: [
    {
      stepIndex: 0,
      id: 'step-sheet-1',
      title: 'Bước 1: Xác định khung mô hình 3 Sheet',
      phase: 'intent',
      status: 'completed',
      startTimeMs: 0,
      endTimeMs: 4000,
      durationMs: 4000,
      summary: 'Khởi tạo cấu trúc workbook 3 tab: Summary PnL, Channel Breakdown, và Cash Flow Forecast.',
      thinking: {
        id: 'think-sheet-1',
        title: 'Thiết kế kiến trúc Workbook đa chiều',
        tokens: 350,
        elapsedMs: 3800,
        content: 'Thiết lập bảng tính với 3 sheet riêng biệt theo chuẩn kế toán tài chính quốc tế IFRS.',
        subThoughtItems: [
          { id: 'st-s1-1', text: 'Khởi tạo workbook với 3 sheet tabs', state: 'completed', durationMs: 1200 }
        ]
      },
      toolCalls: [],
      artifactPatch: {
        mode: 'sheets',
        action: 'init',
        sheetDelta: {
          activeSheetIndex: 0,
          sheets: [
            { id: 'sheet-1', name: 'Summary PnL', rowCount: 15, colCount: 8, cells: {} },
            { id: 'sheet-2', name: 'Channel Breakdown', rowCount: 20, colCount: 6, cells: {} },
            { id: 'sheet-3', name: 'Cash Flow Forecast', rowCount: 25, colCount: 8, cells: {} }
          ]
        }
      },
      projectedArtifactSnapshot: {
        sheetCount: 3,
        activeSheetIndex: 0,
        sheetNames: ['Summary PnL', 'Channel Breakdown', 'Cash Flow Forecast']
      }
    },
    {
      stepIndex: 1,
      id: 'step-sheet-2',
      title: 'Bước 2: Truy vấn Sổ cái ERP & Lập Sheet PnL',
      phase: 'query',
      status: 'completed',
      startTimeMs: 4000,
      endTimeMs: 8500,
      durationMs: 4500,
      summary: 'Thực thi SQL kết nối dữ liệu kế toán và áp dụng công thức SUM/Gross Margin/EBITDA trên Sheet 1.',
      thinking: {
        id: 'think-sheet-2',
        title: 'Truy vấn bảng ledger kế toán và gán công thức',
        tokens: 520,
        elapsedMs: 4200,
        content: 'Chạy SQL lấy số liệu doanh thu và chi phí, chèn công thức Excel: B4=SUM(B2:B3), B7=B4-B5, B9=B7/B4.',
        subThoughtItems: [
          { id: 'st-s2-1', text: 'Chạy SQL truy vấn ERP Ledger', state: 'completed', durationMs: 1900 },
          { id: 'st-s2-2', text: 'Ghi công thức động vào Sheet 1', state: 'completed', durationMs: 1400 }
        ]
      },
      toolCalls: [
        {
          id: 'tool-sql-pnl',
          toolType: 'sql',
          title: 'Truy vấn sổ cái tài chính ERP',
          status: 'success',
          durationMs: 1850,
          input: { query: 'SELECT channel, q1_rev, q2_rev, q3_rev, q4_rev FROM erp_financial_ledger WHERE year = 2025;' },
          output: { rowCount: 4, rows: [['B2B', 1200, 1400, 1550, 1800], ['D2C', 800, 950, 1100, 1300]] }
        }
      ],
      artifactPatch: {
        mode: 'sheets',
        action: 'update',
        sheetDelta: {
          activeSheetIndex: 0,
          sheets: [
            {
              id: 'sheet-1',
              name: 'Summary PnL',
              cells: {
                A1: { v: 'BÁO CÁO KẾT QUẢ KINH DOANH HỢP NHẤT (PnL)', t: 's', s: { bold: true } },
                A3: { v: 'Chỉ tiêu' }, B3: { v: 'Q1/2025' }, C3: { v: 'Q2/2025' }, D3: { v: 'Q3/2025' }, E3: { v: 'Q4/2025' }, F3: { v: 'Cả Năm' },
                A4: { v: 'Doanh thu thuần' }, B4: { v: 2000 }, C4: { v: 2350 }, D4: { v: 2650 }, E4: { v: 3100 }, F4: { f: 'SUM(B4:E4)' },
                A5: { v: 'Giá vốn hàng bán (COGS)' }, B5: { v: 1100 }, C5: { v: 1250 }, D5: { v: 1380 }, E5: { v: 1600 }, F5: { f: 'SUM(B5:E5)' },
                A6: { v: 'Lợi nhuận gộp' }, B6: { f: 'B4-B5' }, C6: { f: 'C4-C5' }, D6: { f: 'D4-D5' }, E6: { f: 'E4-E5' }, F6: { f: 'F4-F5' },
                A7: { v: 'Biên lợi nhuận gộp' }, B7: { f: 'B6/B4' }, C7: { f: 'C6/C4' }, D7: { f: 'D6/D4' }, E7: { f: 'E6/E4' }, F7: { f: 'F6/F4' },
                A8: { v: 'EBITDA' }, B8: { v: 450 }, C8: { v: 560 }, D8: { v: 670 }, E8: { v: 820 }, F8: { f: 'SUM(B8:E8)' }
              }
            }
          ]
        }
      },
      projectedArtifactSnapshot: {
        sheetCount: 3,
        activeSheetIndex: 0,
        sheetNames: ['Summary PnL', 'Channel Breakdown', 'Cash Flow Forecast'],
        activeSheetData: { totalRevenueFormula: 'SUM(B4:E4)', grossMarginFormula: 'F6/F4' }
      }
    },
    {
      stepIndex: 2,
      id: 'step-sheet-3',
      title: 'Bước 3: Mô hình hóa Đóng góp Doanh thu Đa Kênh',
      phase: 'code',
      status: 'completed',
      startTimeMs: 8500,
      endTimeMs: 14000,
      durationMs: 5500,
      summary: 'Dùng Python phân tích tỷ trọng 4 kênh (B2B, Website, Shopee, TikTok Shop) và tạo Sheet 2.',
      thinking: {
        id: 'think-sheet-3',
        title: 'Tính toán Unit Economics và tỷ trọng đóng góp kênh',
        tokens: 610,
        elapsedMs: 5100,
        content: 'Chạy code Python tính Unit Economics cho từng kênh bán lẻ, áp dụng conditional formatting heatmap cho Sheet 2.',
        subThoughtItems: [
          { id: 'st-s3-1', text: 'Chạy Python phân tích đa kênh', state: 'completed', durationMs: 2100 },
          { id: 'st-s3-2', text: 'Kích hoạt Sheet 2 với bảng phân tích kênh', state: 'completed', durationMs: 1800 }
        ]
      },
      toolCalls: [
        {
          id: 'tool-py-channels',
          toolType: 'python',
          title: 'Phân tích Unit Economics 4 kênh bán',
          status: 'success',
          durationMs: 1980,
          input: { code: 'channels = {"B2B": 0.42, "E-Com": 0.33, "Retail": 0.15, "SaaS": 0.10}\nprint({k: f"{v*100}%" for k,v in channels.items()})' },
          output: { stdout: "{'B2B': '42.0%', 'E-Com': '33.0%', 'Retail': '15.0%', 'SaaS': '10.0%'}" }
        }
      ],
      artifactPatch: {
        mode: 'sheets',
        action: 'update',
        sheetDelta: {
          activeSheetIndex: 1,
          sheets: [
            {
              id: 'sheet-2',
              name: 'Channel Breakdown',
              cells: {
                A1: { v: 'PHÂN TÍCH HIỆU QUẢ KÊNH BÁN HÀNG' },
                A3: { v: 'Kênh Bán' }, B3: { v: 'Doanh Thu (Tỷ VNĐ)' }, C3: { v: 'Tỷ Trọng' }, D3: { v: 'Chi Phí Kênh' }, E3: { v: 'Biên Kênh' },
                A4: { v: 'B2B Enterprise' }, B4: { v: 42.0 }, C4: { v: '42%' }, D4: { v: 12.5 }, E4: { v: '70.2%' },
                A5: { v: 'Website D2C' }, B5: { v: 33.0 }, C5: { v: '33%' }, D5: { v: 8.2 }, E5: { v: '75.1%' },
                A6: { v: 'Sàn TMĐT (Shopee/TikTok)' }, B6: { v: 15.0 }, C6: { v: '15%' }, D6: { v: 4.8 }, E6: { v: '68.0%' },
                A7: { v: 'SaaS Subscription' }, B7: { v: 10.0 }, C7: { v: '10%' }, D7: { v: 1.5 }, E7: { v: '85.0%' }
              }
            }
          ]
        }
      },
      projectedArtifactSnapshot: {
        sheetCount: 3,
        activeSheetIndex: 1,
        sheetNames: ['Summary PnL', 'Channel Breakdown', 'Cash Flow Forecast']
      }
    },
    {
      stepIndex: 3,
      id: 'step-sheet-4',
      title: 'Bước 4: Dự báo Dòng tiền 3 Năm & Stress Test',
      phase: 'synthesis',
      status: 'completed',
      startTimeMs: 14000,
      endTimeMs: 20000,
      durationMs: 6000,
      summary: 'Xây dựng Sheet 3 dự báo dòng tiền 2025-2027 với 3 kịch bản Base, Bull, Bear và hoàn tất mô hình tài chính.',
      thinking: {
        id: 'think-sheet-4',
        title: 'Mô phỏng dòng tiền tự do FCF và Stress test',
        tokens: 720,
        elapsedMs: 5600,
        content: 'Hoàn thành bảng dòng tiền 3 dòng: Hoạt động kinh doanh, Đầu tư, Tài chính. Kết quả số dư tiền mặt cuối năm 2027 đạt 145 tỷ VNĐ (Kịch bản Base).',
        subThoughtItems: [
          { id: 'st-s4-1', text: 'Mô phỏng dòng tiền 3 năm', state: 'completed', durationMs: 2200 },
          { id: 'st-s4-2', text: 'Tạo công thức FCF và highlight ô tiền ròng', state: 'completed', durationMs: 2100 }
        ]
      },
      toolCalls: [],
      artifactPatch: {
        mode: 'sheets',
        action: 'finalize',
        sheetDelta: {
          activeSheetIndex: 2,
          sheets: [
            {
              id: 'sheet-3',
              name: 'Cash Flow Forecast',
              cells: {
                A1: { v: 'DỰ BÁO DÒNG TIỀN 3 NĂM (2025 - 2027)' },
                A3: { v: 'Dòng tiền' }, B3: { v: '2025' }, C3: { v: '2026' }, D3: { v: '2027' },
                A4: { v: 'Dòng tiền HĐKD (CFO)' }, B4: { v: 38.5 }, C4: { v: 52.0 }, D4: { v: 71.5 },
                A5: { v: 'Dòng tiền Đầu tư (CFI)' }, B5: { v: -15.0 }, C5: { v: -18.0 }, D5: { v: -12.0 },
                A6: { v: 'Dòng tiền Tài chính (CFF)' }, B6: { v: 0.0 }, C6: { v: 10.0 }, D6: { v: -5.0 },
                A7: { v: 'DÒNG TIỀN THUẦN (NET CASH)' }, B7: { f: 'B4+B5+B6' }, C7: { f: 'C4+C5+C6' }, D7: { f: 'D4+D5+D6' }
              }
            }
          ]
        }
      },
      projectedArtifactSnapshot: {
        sheetCount: 3,
        activeSheetIndex: 2,
        sheetNames: ['Summary PnL', 'Channel Breakdown', 'Cash Flow Forecast'],
        finalNetCash2027: 'D4+D5+D6'
      }
    }
  ],
  forkContext: {
    model: 'dbgpt-kimi-agent',
    initialMessages: [
      { role: 'user', content: 'Xây dựng mô hình tài chính PnL hợp nhất đa kênh và dự báo dòng tiền 3 năm (2025-2027) bằng bảng tính Excel có công thức động.' },
      { role: 'assistant', content: 'Tôi đã tạo mô hình tài chính Excel 3 sheet hoàn chỉnh với công thức động PnL, phân tích đa kênh và dự báo dòng tiền 3 năm.' }
    ],
    finalArtifact: {
      type: 'sheets',
      title: 'Mô Hình Tài Chính PnL Hợp Nhất Đa Kênh & Dự Báo Dòng Tiền 3 Năm',
      data: { sheetCount: 3, format: 'xlsx' }
    }
  }
};

export const MOCK_AI_ARCHITECTURE_SESSION = {
  id: 'replay_ai_architecture_docx',
  title: 'Báo Cáo Kiến Trúc Hệ Thống AI Doanh Nghiệp & Phân Tầng Multi-Agent',
  subtitle: 'Thiết Kế Topology Tự Hành, Guardrails Bảo Mật & Tối Ưu Hóa Token (Tài Liệu A4)',
  mode: 'docs',
  badge: 'Enterprise Architecture • DOCX • A4',
  description: 'Replay phiên soạn thảo báo cáo kiến trúc hệ thống AI A4 chuẩn mực với 5 chương, mục lục tương tác và guardrails an toàn.',
  author: 'DB-GPT AI Engineering Team',
  createdAt: '2026-08-22T10:00:00Z',
  totalDurationMs: 22000,
  userPrompt: 'Soạn thảo báo cáo kiến trúc hệ thống AI Doanh nghiệp (Enterprise AI Architecture Report) định dạng tài liệu A4 hoàn chỉnh gồm phân tầng Multi-Agent, bảo mật Guardrails và lộ trình triển khai.',
  tags: ['Architecture', 'DOCX', 'A4', 'MultiAgent', 'Security', 'Enterprise'],
  theme: {
    bg: '#1e1b4b',
    fg: '#e0e7ff',
    accent: '#6366f1',
    secondary: '#818cf8',
  },
  steps: [
    {
      stepIndex: 0,
      id: 'step-doc-1',
      title: 'Bước 1: Xây dựng khung cấu trúc tài liệu A4 & Mục lục',
      phase: 'intent',
      status: 'completed',
      startTimeMs: 0,
      endTimeMs: 4500,
      durationMs: 4500,
      summary: 'Khởi tạo tài liệu A4, thiết lập tiêu đề, thông tin phiên bản và mục lục 5 chương theo tiêu chuẩn ISO/IEC 42001.',
      thinking: {
        id: 'think-doc-1',
        title: 'Thiết kế bố cục tài liệu A4 theo chuẩn kiến trúc',
        tokens: 460,
        elapsedMs: 4300,
        content: 'Cấu trúc tài liệu gồm: 1. Tóm tắt điều hành, 2. Kiến trúc 3 tầng Multi-Agent, 3. Khung bảo mật Guardrails, 4. Benchmark hiệu năng, 5. Lộ trình triển khai.',
        subThoughtItems: [
          { id: 'st-d1-1', text: 'Tạo A4 Document Header & Metadata bar', state: 'completed', durationMs: 1400 },
          { id: 'st-d1-2', text: 'Tạo Mục lục tương tác (Table of Contents)', state: 'completed', durationMs: 1600 }
        ]
      },
      toolCalls: [],
      artifactPatch: {
        mode: 'docs',
        action: 'init',
        docxDelta: {
          activeSectionId: 'sec-toc',
          tableOfContents: [
            { id: 'sec-1', title: '1. Tóm Tắt Điều Hành (Executive Summary)', level: 1 },
            { id: 'sec-2', title: '2. Kiến Trúc Phân Tầng Multi-Agent Swarm', level: 1 },
            { id: 'sec-3', title: '3. Khung An Ninh, Quyền Riêng Tư & Guardrails', level: 1 },
            { id: 'sec-4', title: '4. Kết Quả Đo Lường Hiệu Năng & Độ Trễ (Benchmark)', level: 1 },
            { id: 'sec-5', title: '5. Lộ Trình Triển Khai & Phê Duyệt Nghiệm Thu', level: 1 }
          ],
          appendMarkdown: '# BÁO CÁO KIẾN TRÚC HỆ THỐNG AI DOANH NGHIỆP\n**Phiên bản**: 2.4-Enterprise | **Ngày ban hành**: Tháng 8/2026\n\n---\n'
        }
      },
      projectedArtifactSnapshot: {
        sectionsCount: 1,
        tocCount: 5,
        documentTitle: 'BÁO CÁO KIẾN TRÚC HỆ THỐNG AI DOANH NGHIỆP'
      }
    },
    {
      stepIndex: 1,
      id: 'step-doc-2',
      title: 'Bước 2: Thiết kế Topology Multi-Agent Swarm',
      phase: 'query',
      status: 'completed',
      startTimeMs: 4500,
      endTimeMs: 10000,
      durationMs: 5500,
      summary: 'Soạn thảo Chương 1 và Chương 2 mô tả chi tiết mô hình 3 tầng: Supervisor Agent, Domain Specialists, và Execution Workers.',
      thinking: {
        id: 'think-doc-2',
        title: 'Soạn thảo Chương 1 & 2 với sơ đồ phân tầng Agent',
        tokens: 890,
        elapsedMs: 5200,
        content: 'Mô tả cấu trúc 3 tầng: 1. Supervisor Agent điều phối, 2. Specialist Agents (Data Analyst, SQL Expert, PPTX Builder), 3. Sandboxed Workers.',
        subThoughtItems: [
          { id: 'st-d2-1', text: 'Soạn Chương 1: Tóm tắt điều hành', state: 'completed', durationMs: 1800 },
          { id: 'st-d2-2', text: 'Soạn Chương 2: Mô hình Multi-Agent Swarm', state: 'completed', durationMs: 2400 }
        ]
      },
      toolCalls: [
        {
          id: 'tool-web-search-1',
          toolType: 'web_search',
          title: 'Tìm kiếm mẫu kiến trúc Multi-Agent chuẩn Doanh nghiệp',
          status: 'success',
          durationMs: 1200,
          input: { searchQuery: 'enterprise multi-agent architecture best practices 2026' },
          output: {
            searchResults: [
              { title: 'Multi-Agent Orchestration Patterns', url: 'https://dbgpt.ai/docs/multi-agent', snippet: 'Supervisor-Worker and Swarm patterns for low-latency agentic execution.' }
            ]
          }
        }
      ],
      artifactPatch: {
        mode: 'docs',
        action: 'append',
        docxDelta: {
          activeSectionId: 'sec-2',
          appendMarkdown: '## 1. Tóm Tắt Điều Hành (Executive Summary)\nHệ thống DB-GPT Multi-Agent cung cấp khả năng tự động hóa quy trình phân tích và ra quyết định cho doanh nghiệp với độ chính xác cao và kiểm soát an toàn nghiêm ngặt.\n\n## 2. Kiến Trúc Phân Tầng Multi-Agent Swarm\nMô hình gồm 3 lớp độc lập:\n- **Lớp 1 (Supervisor)**: Tiếp nhận yêu cầu, phân rã công việc và điều phối tài nguyên.\n- **Lớp 2 (Domain Specialists)**: Xử lý chuyên sâu nghiệp vụ SQL, Python, và soạn thảo tài liệu.\n- **Lớp 3 (Sandboxed Workers)**: Môi trường thực thi cô lập an toàn, ngăn chặn rò rỉ dữ liệu.\n'
        }
      },
      projectedArtifactSnapshot: {
        sectionsCount: 2,
        tocCount: 5,
        hasMultiAgentSection: true
      }
    },
    {
      stepIndex: 2,
      id: 'step-doc-3',
      title: 'Bước 3: Thiết lập Guardrails Bảo mật & Tối ưu Latency',
      phase: 'code',
      status: 'completed',
      startTimeMs: 10000,
      endTimeMs: 16000,
      durationMs: 6000,
      summary: 'Soạn thảo Chương 3 & 4 về cơ chế bảo mật PII, mã hóa AES-256 và bảng kết quả benchmark độ trễ P50/P95.',
      thinking: {
        id: 'think-doc-3',
        title: 'Chạy mô phỏng Benchmark và hoàn thiện cơ chế Guardrails',
        tokens: 780,
        elapsedMs: 5600,
        content: 'Chạy Python tính toán độ trễ phản hồi P50 (420ms), P95 (890ms) và tỷ lệ cache hit 68%. Chèn kết quả vào Chương 4.',
        subThoughtItems: [
          { id: 'st-d3-1', text: 'Mô phỏng benchmark độ trễ', state: 'completed', durationMs: 1900 },
          { id: 'st-d3-2', text: 'Soạn Chương 3 & 4 trong tài liệu', state: 'completed', durationMs: 2300 }
        ]
      },
      toolCalls: [
        {
          id: 'tool-py-latency',
          toolType: 'python',
          title: 'Mô phỏng Benchmark độ trễ P50 / P95',
          status: 'success',
          durationMs: 1650,
          input: { code: 'import numpy as np\nlatencies = [380, 410, 420, 450, 820, 890, 920]\nprint(f"P50: {np.percentile(latencies, 50)}ms, P95: {np.percentile(latencies, 95)}ms")' },
          output: { stdout: 'P50: 450.0ms, P95: 902.0ms' }
        }
      ],
      artifactPatch: {
        mode: 'docs',
        action: 'append',
        docxDelta: {
          activeSectionId: 'sec-4',
          appendMarkdown: '## 3. Khung An Ninh, Quyền Riêng Tư & Guardrails\n- **Kiểm duyệt Input/Output**: Tự động nhận diện và ẩn giấu thông tin cá nhân (PII).\n- **Mã hóa Dữ liệu**: Mã hóa đầu cuối TLS 1.3 và lưu trữ AES-256 GCM.\n\n## 4. Kết Quả Đo Lường Hiệu Năng & Độ Trễ (Benchmark)\n| Chỉ Số Đo Lường | Giá Trị Thực Tế | Tiêu Chuẩn Mục Tiêu |\n|---|---|---|\n| Độ trễ P50 | 420 ms | < 500 ms |\n| Độ trễ P95 | 890 ms | < 1000 ms |\n| Tỷ lệ Cache Hit | 68.4% | > 60.0% |\n'
        }
      },
      projectedArtifactSnapshot: {
        sectionsCount: 4,
        tocCount: 5,
        hasBenchmarkTable: true
      }
    },
    {
      stepIndex: 3,
      id: 'step-doc-4',
      title: 'Bước 4: Lộ trình Triển khai 4 Giai đoạn & Phê duyệt',
      phase: 'synthesis',
      status: 'completed',
      startTimeMs: 16000,
      endTimeMs: 22000,
      durationMs: 6000,
      summary: 'Soạn Chương 5 về kế hoạch triển khai 4 giai đoạn và hoàn thiện khung ký duyệt nghiệm thu tài liệu A4.',
      thinking: {
        id: 'think-doc-4',
        title: 'Hoàn thiện Chương 5 và biên dịch tài liệu A4 hoàn chỉnh',
        tokens: 650,
        elapsedMs: 5400,
        content: 'Soạn thảo Chương 5 gồm 4 giai đoạn: Nền móng -> Thử nghiệm -> Triển khai diện rộng -> Tự hành hóa. Tạo khung ký duyệt.',
        subThoughtItems: [
          { id: 'st-d4-1', text: 'Soạn Chương 5 Lộ trình triển khai', state: 'completed', durationMs: 2200 },
          { id: 'st-d4-2', text: 'Đóng gói tài liệu và tạo nút tải DOCX', state: 'completed', durationMs: 2100 }
        ]
      },
      toolCalls: [],
      artifactPatch: {
        mode: 'docs',
        action: 'finalize',
        docxDelta: {
          activeSectionId: 'sec-5',
          appendMarkdown: '## 5. Lộ Trình Triển Khai & Phê Duyệt Nghiệm Thu\n- **Giai đoạn 1**: Thiết lập hạ tầng và kết nối kho dữ liệu (Tháng 1-2).\n- **Giai đoạn 2**: Thử nghiệm cụm Multi-Agent cho 5 nghiệp vụ chính (Tháng 3-4).\n- **Giai đoạn 3**: Triển khai chính thức toàn doanh nghiệp (Tháng 5-8).\n- **Giai đoạn 4**: Tối ưu hóa tự động và mở rộng năng lực (Tháng 9-12).\n\n---\n**Xác Nhận Của Hội Đồng Kiến Trúc Công Nghệ**\n- Kiến trúc sư trưởng: *Đã ký duyệt*\n- Giám đốc Công nghệ (CTO): *Đã phê duyệt*'
        }
      },
      projectedArtifactSnapshot: {
        sectionsCount: 5,
        tocCount: 5,
        isFinalized: true
      }
    }
  ],
  forkContext: {
    model: 'dbgpt-kimi-agent',
    initialMessages: [
      { role: 'user', content: 'Soạn thảo báo cáo kiến trúc hệ thống AI Doanh nghiệp (Enterprise AI Architecture Report) định dạng tài liệu A4 hoàn chỉnh gồm phân tầng Multi-Agent, bảo mật Guardrails và lộ trình triển khai.' },
      { role: 'assistant', content: 'Tôi đã hoàn thành báo cáo kiến trúc hệ thống AI chuẩn A4 với 5 chương chi tiết, bảng benchmark và cơ chế bảo mật đầy đủ.' }
    ],
    finalArtifact: {
      type: 'docs',
      title: 'Báo Cáo Kiến Trúc Hệ Thống AI Doanh Nghiệp & Phân Tầng Multi-Agent',
      data: { sectionCount: 5, format: 'docx' }
    }
  }
};

export const MOCK_REPLAY_SESSIONS = [
  MOCK_STRATEGY_DECK_SESSION,
  MOCK_FINANCIAL_PNL_SESSION,
  MOCK_AI_ARCHITECTURE_SESSION,
];
