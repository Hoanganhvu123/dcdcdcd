import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Compass, Sparkles, Search, ArrowRight, Bot, Cpu, Globe2, ShieldCheck, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const RESEARCH_PROMPTS = [
  {
    title: 'Nghiên cứu Chiến lược Bán dẫn & AI Chips 2026',
    desc: 'Phân tích chuỗi cung ứng toàn cầu, công nghệ đóng gói tiên tiến (CoWoS), và năng lực sản xuất wafer 2nm.',
    tags: ['Tech', 'Semiconductors', 'Hardware'],
    prompt: 'Thực hiện nghiên cứu chuyên sâu về thị trường chip AI và bán dẫn toàn cầu năm 2026: Nhu cầu HBM, rào cản địa chính trị, và lộ trình phát triển GPU/NPU.',
  },
  {
    title: 'Báo cáo Toàn cảnh Ngành Thương mại Điện tử Đa Kênh',
    desc: 'Xu hướng Quick Commerce, Social Commerce trên TikTok Shop, biên lợi nhuận logistics và hành vi người tiêu dùng.',
    tags: ['E-Commerce', 'Retail', 'Logistics'],
    prompt: 'Nghiên cứu toàn diện ngành thương mại điện tử đa kênh tại Đông Nam Á: Tỷ lệ thâm nhập, chiến lược định giá, và chi phí thu hút khách hàng (CAC).',
  },
  {
    title: 'Đánh giá Thị trường Năng lượng Tái tạo & Pin Lưu trữ',
    desc: 'Thị phần pin thể rắn, chính sách carbon neutral, và hiệu quả kinh tế của các dự án điện mặt trời/gió.',
    tags: ['CleanTech', 'Energy', 'ESG'],
    prompt: 'Phân tích chuyên sâu ngành năng lượng tái tạo và công nghệ lưu trữ năng lượng BESS: Chi phí LCOE, rủi ro pháp lý và cơ hội đầu tư.',
  },
];

export default function DeepResearchPage() {
  const router = useRouter();
  const [customPrompt, setCustomPrompt] = useState('');

  const handleLaunchResearch = (promptText: string) => {
    router.push({
      pathname: '/',
      query: {
        prompt: promptText,
        mode: 'deep_research',
      },
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-y-auto custom-scrollbar">
      <Head>
        <title>Deep Research Studio | DB-GPT</title>
        <meta
          name="description"
          content="Hệ thống nghiên cứu đa tầng tự động (Autonomous Deep Research). Khảo sát hàng trăm nguồn dữ liệu, tổng hợp và lập báo cáo chuyên sâu."
        />
      </Head>

      {/* TOP HEADER */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-xs">
            <Compass className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Deep Research Studio</h1>
              <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                MULTI-AGENT SWARM
              </span>
            </div>
            <p className="text-[0.6875rem] text-zinc-500 dark:text-zinc-400">
              Nghiên cứu đa tầng tự động với hệ thống Agent tìm kiếm, phân tích và trích dẫn dữ liệu thời gian thực
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 font-sans">
        {/* HERO BANNER */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium uppercase tracking-wider mb-3">
            <Sparkles className="w-3 h-3" /> Autonomous Deep Agent
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Nghiên Cứu Chuyên Sâu Đa Nguồn Dữ Liệu
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-2">
            Nhập chủ đề bất kỳ để kích hoạt đội ngũ AI Agent tự động tìm kiếm, phân tích chéo tài liệu và lập báo cáo nghiên cứu toàn diện.
          </p>
        </div>

        {/* INPUT FORM */}
        <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs mb-10">
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Nhập câu hỏi nghiên cứu hoặc chủ đề bạn muốn AI khảo sát sâu (ví dụ: Phân tích cơ hội thị trường xe điện tại Đông Nam Á 2026-2030)..."
            className="w-full h-28 bg-transparent text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none resize-none"
          />
          <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-4 text-xs text-zinc-500 font-medium">
              <span className="flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5" /> Web & DB Search</span>
              <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> Multi-Step Reasoning</span>
            </div>
            <button
              onClick={() => handleLaunchResearch(customPrompt || 'Nghiên cứu thị trường AI Data Analytics năm 2026')}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-100 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-semibold shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5" /> Bắt Đầu Nghiên Cứu
            </button>
          </div>
        </div>

        {/* FEATURED RESEARCH TOPICS */}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono mb-4">
          Chủ Đề Nghiên Cứu Tiêu Biểu (Featured Cases)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {RESEARCH_PROMPTS.map((item, idx) => (
            <div
              key={idx}
              onClick={() => handleLaunchResearch(item.prompt)}
              className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs hover:shadow-md hover:-translate-y-1 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {item.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700">
                      {t}
                    </span>
                  ))}
                </div>
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 transition-colors">
                  {item.title}
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
                  {item.desc}
                </p>
              </div>
              <span className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                Khai thác đề tài →
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
