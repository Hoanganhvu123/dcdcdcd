import assert from 'node:assert/strict';
import {
  StreamXMLFilter,
  filterXMLTagsSync,
  parseToolCallSyntax,
  parsePythonLiteral,
} from '../components/openwork/services/stream-xml-filter.ts';

console.log('--- Testing StreamXMLFilter State Machine ---');

// Test 1: Normal text without tags passes through untruncated and unaltered
{
  const chunks = ['Xin chào! ', 'Tôi là trợ lý ', 'DB-GPT OpenWork.'];
  let emittedContent = '';
  let emittedReasoning = '';
  const filter = new StreamXMLFilter({
    onContentDelta: (delta) => { emittedContent += delta; },
    onReasoningDelta: (delta) => { emittedReasoning += delta; },
  });

  for (const c of chunks) filter.push(c);
  filter.flush();

  assert.equal(emittedContent, 'Xin chào! Tôi là trợ lý DB-GPT OpenWork.');
  assert.equal(emittedReasoning, '');
  console.log('✓ Test 1 Passed: Normal prose untouched');
}

// Test 2: Complete <think>...</think> in single chunk
{
  const text = '<think>Phân tích số liệu doanh thu Q3</think>Doanh thu đạt 2.45 tỷ đồng.';
  let content = '';
  let reasoning = '';
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => { content += d; },
    onReasoningDelta: (d) => { reasoning += d; },
  });
  filter.push(text);
  filter.flush();

  assert.equal(reasoning, 'Phân tích số liệu doanh thu Q3');
  assert.equal(content, 'Doanh thu đạt 2.45 tỷ đồng.');
  console.log('✓ Test 2 Passed: Single chunk <think> cleanly separated');
}

// Test 3: Tag boundaries split across micro-chunks (Token-level streaming)
{
  const microChunks = [
    '<', 'th', 'in', 'k', '>',
    'Step 1: ', 'Calculate ', 'margin. ',
    '<', '/', 'th', 'in', 'k', '>',
    'Kế ', 'hoạch ', 'tăng ', 'trưởng: ', '15%.'
  ];
  let content = '';
  let reasoning = '';
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => { content += d; },
    onReasoningDelta: (d) => { reasoning += d; },
  });

  for (const mc of microChunks) {
    filter.push(mc);
  }
  filter.flush();

  assert.equal(reasoning, 'Step 1: Calculate margin. ');
  assert.equal(content, 'Kế hoạch tăng trưởng: 15%.');
  assert.ok(!content.includes('<think>'), 'Content must not leak <think>');
  assert.ok(!content.includes('</think>'), 'Content must not leak </think>');
  console.log('✓ Test 3 Passed: Micro-chunk fragmentation across tag boundaries');
}

// Test 4: Tool call XML tags filtered to tool call callback
{
  const chunks = [
    'Trước tiên tôi sẽ kiểm tra database:\n',
    '<tool_call>{"name": "sql_query", "args": {"sql": "SELECT * FROM sales"}}</tool_call>',
    '\nĐã tìm thấy 120 dòng kết quả.'
  ];
  let content = '';
  let toolCall = '';
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => { content += d; },
    onToolCallDelta: (d) => { toolCall += d; },
  });

  for (const c of chunks) filter.push(c);
  filter.flush();

  assert.equal(content, 'Trước tiên tôi sẽ kiểm tra database:\n\nĐã tìm thấy 120 dòng kết quả.');
  assert.equal(toolCall, '{"name": "sql_query", "args": {"sql": "SELECT * FROM sales"}}');
  assert.ok(!content.includes('<tool_call>'), 'Content must not leak <tool_call>');
  assert.ok(!content.includes('</tool_call>'), 'Content must not leak </tool_call>');
  console.log('✓ Test 4 Passed: Tool call tags intercepted cleanly');
}

// Test 5: False alarm tags (e.g. math inequalities 3 < 5 or custom HTML <div className="">)
{
  const input = 'Doanh thu A < 5 tỷ và B < 10 tỷ. <div>Bảng tóm tắt</div>';
  let content = '';
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => { content += d; },
  });
  filter.push(input);
  filter.flush();

  assert.equal(content, input);
  console.log('✓ Test 5 Passed: Non-target angle brackets and tags passed through');
}

// Test 6: Incomplete tag at EOF flushes safely without hanging
{
  let content = '';
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => { content += d; },
  });
  filter.push('Biểu thức so sánh: x <');
  filter.flush();

  assert.equal(content, 'Biểu thức so sánh: x <');
  console.log('✓ Test 6 Passed: Incomplete tag at EOF safely flushed');
}

// Test 7: filterXMLTagsSync helper
{
  const fullOutput = '<think>Thinking about PnL</think>Báo cáo tài chính hoàn chỉnh.';
  const res = filterXMLTagsSync(fullOutput);
  assert.equal(res.reasoning, 'Thinking about PnL');
  assert.equal(res.content, 'Báo cáo tài chính hoàn chỉnh.');
  console.log('✓ Test 7 Passed: filterXMLTagsSync synchronous utility');
}

// Test 8: Intercept raw LLM tool_code JSON in single chunk (Spreadsheet Studio)
{
  let content = '';
  const toolCalls = [];
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => {
      content += d;
    },
    onStructuredToolCall: (tc) => {
      toolCalls.push(tc);
    },
  });

  const rawInput =
    "Đang tạo bảng tính phân tích doanh thu:\n{ \"tool_code\": \"print(spreadsheet_studio(sheets=[{'name': 'PnL_2026', 'rows': [['Quý', 'Doanh Thu'], ['Q1', 100]]}]))\" }\nBảng tính đã hoàn tất và sẵn sàng trong Workbench.";
  filter.push(rawInput);
  filter.flush();

  assert.equal(
    content,
    'Đang tạo bảng tính phân tích doanh thu:\n\nBảng tính đã hoàn tất và sẵn sàng trong Workbench.'
  );
  assert.ok(!content.includes('tool_code'), 'Content must strictly NOT leak tool_code');
  assert.ok(!content.includes('print(spreadsheet_studio'), 'Content must NOT leak tool function call');
  assert.ok(toolCalls.length >= 1, 'At least 1 structured tool call emitted');

  const finalCall = toolCalls[toolCalls.length - 1];
  assert.equal(finalCall.name, 'spreadsheet_studio');
  const parsedArgs = JSON.parse(finalCall.accumulatedArguments);
  assert.ok(Array.isArray(parsedArgs.sheets), 'sheets array exists');
  assert.equal(parsedArgs.sheets[0].name, 'PnL_2026');
  assert.deepEqual(parsedArgs.sheets[0].rows, [['Quý', 'Doanh Thu'], ['Q1', 100]]);
  console.log('✓ Test 8 Passed: Raw tool_code JSON in single chunk cleanly intercepted and stripped');
}

// Test 9: Intercept raw LLM tool_code JSON fragmented across micro-chunks (Token Streaming)
{
  let content = '';
  const toolCalls = [];
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => {
      content += d;
    },
    onStructuredToolCall: (tc) => {
      toolCalls.push(tc);
    },
  });

  const rawFull =
    "Slide thuyết trình chiến lược:\n{ \"tool_code\": \"print(presentation_builder(title='Chiến Lược 2026', slides=[{'title': 'Tổng Quan', 'layout': 'hero'}]))\" }\nChúc bạn buổi thuyết trình thành công.";

  // Push 1 character at a time to test streaming boundary robustness
  for (const ch of rawFull) {
    filter.push(ch);
  }
  filter.flush();

  assert.equal(
    content,
    'Slide thuyết trình chiến lược:\n\nChúc bạn buổi thuyết trình thành công.'
  );
  assert.ok(!content.includes('tool_code'), 'Content must not leak tool_code');
  assert.ok(!content.includes('presentation_builder'), 'Content must not leak tool name in prose');
  assert.ok(toolCalls.length >= 1, 'Must emit structured tool call');

  const finalCall = toolCalls[toolCalls.length - 1];
  assert.equal(finalCall.name, 'presentation_builder');
  const parsedArgs = JSON.parse(finalCall.accumulatedArguments);
  assert.equal(parsedArgs.title, 'Chiến Lược 2026');
  assert.equal(parsedArgs.slides[0].title, 'Tổng Quan');
  console.log('✓ Test 9 Passed: Micro-chunk fragmented tool_code stream cleanly intercepted');
}

// Test 10: Tool call wrapped in markdown code fence (```json ... ```)
{
  let content = '';
  const toolCalls = [];
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => {
      content += d;
    },
    onStructuredToolCall: (tc) => {
      toolCalls.push(tc);
    },
  });

  const input =
    "Tài liệu báo cáo điều hành:\n```json\n{\n  \"tool_code\": \"print(doc_writer(title='Báo Cáo Điều Hành', content='# Báo Cáo\\nNội dung chi tiết...'))\"\n}\n```\nTài liệu đã được lưu.";
  filter.push(input);
  filter.flush();

  assert.equal(content, 'Tài liệu báo cáo điều hành:\n\nTài liệu đã được lưu.');
  assert.ok(!content.includes('```'), 'Must strip code block fences');
  assert.ok(!content.includes('doc_writer'), 'Must strip tool code');

  const finalCall = toolCalls[toolCalls.length - 1];
  assert.equal(finalCall.name, 'doc_writer');
  const parsedArgs = JSON.parse(finalCall.accumulatedArguments);
  assert.equal(parsedArgs.title, 'Báo Cáo Điều Hành');
  assert.equal(parsedArgs.content, '# Báo Cáo\nNội dung chi tiết...');
  console.log('✓ Test 10 Passed: Code fenced tool_code stripped cleanly from markdown');
}

// Test 11: SQL query runner tool call
{
  const rawSqlCall = '{ "tool_code": "print(sql_query_runner(query=\\"SELECT * FROM fact_orders WHERE status = \\x27completed\\x27\\"))" }';
  const parsed = parseToolCallSyntax(rawSqlCall);
  assert.ok(parsed, 'Must parse SQL tool call syntax');
  assert.equal(parsed.name, 'sql_query_runner');
  assert.equal(parsed.args.query, "SELECT * FROM fact_orders WHERE status = 'completed'");
  console.log('✓ Test 11 Passed: SQL query runner tool call parsed');
}

// Test 12: Non-tool JSON in prose passes through completely intact (False alarm check)
{
  let content = '';
  const filter = new StreamXMLFilter({
    onContentDelta: (d) => {
      content += d;
    },
  });

  const proseWithJson = 'Thông tin máy chủ: { "host": "127.0.0.1", "port": 8080, "active": true }. Hãy kiểm tra lại.';
  filter.push(proseWithJson);
  filter.flush();

  assert.equal(content, proseWithJson);
  console.log('✓ Test 12 Passed: Non-tool JSON in prose passes through untouched');
}

// Test 13: filterXMLTagsSync helper with tool_code
{
  const fullOutput =
    "Phân tích hoàn tất:\n{ \"tool_code\": \"print(spreadsheet_studio(sheets=[{'name': 'Sheet1'}]))\" }\nXem bảng tính bên phải.";
  const res = filterXMLTagsSync(fullOutput);
  assert.equal(res.content, 'Phân tích hoàn tất:\n\nXem bảng tính bên phải.');
  assert.ok(res.structuredToolCalls.length >= 1);
  assert.equal(res.structuredToolCalls[0].name, 'spreadsheet_studio');
  console.log('✓ Test 13 Passed: filterXMLTagsSync intercepts tool_code in sync mode');
}

console.log('All 13 StreamXMLFilter tests passed successfully!');
