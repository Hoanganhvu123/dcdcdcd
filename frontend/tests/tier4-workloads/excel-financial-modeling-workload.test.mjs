import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

test('Tier 4.2: Real-World Workload - Multi-Sheet Financial Modeling & Formula Verification', async (t) => {
  await t.test('T4.2.1: Generate 3-statement financial model workbook with formulas and re-parse', () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Income Statement
    const incomeData = [
      ['Line Item', '2024 (A)', '2025 (P)', '2026 (P)'],
      ['Revenue', 1000000, 1400000, 1900000],
      ['COGS', 400000, 520000, 680000],
      ['Gross Profit', { t: 'n', v: 600000, f: 'B2-B3' }, { t: 'n', v: 880000, f: 'C2-C3' }, { t: 'n', v: 1220000, f: 'D2-D3' }],
      ['Operating Expenses', 350000, 420000, 510000],
      ['EBITDA', { t: 'n', v: 250000, f: 'B4-B5' }, { t: 'n', v: 460000, f: 'C4-C5' }, { t: 'n', v: 710000, f: 'D4-D5' }]
    ];
    const wsIncome = XLSX.utils.aoa_to_sheet(incomeData);
    XLSX.utils.book_append_sheet(wb, wsIncome, 'Income Statement');

    // Sheet 2: Balance Sheet
    const balanceData = [
      ['Account', '2024 (A)', '2025 (P)'],
      ['Cash', 500000, 750000],
      ['Accounts Receivable', 180000, 220000],
      ['Total Current Assets', { t: 'n', v: 680000, f: 'SUM(B2:B3)' }, { t: 'n', v: 970000, f: 'SUM(C2:C3)' }]
    ];
    const wsBalance = XLSX.utils.aoa_to_sheet(balanceData);
    XLSX.utils.book_append_sheet(wb, wsBalance, 'Balance Sheet');

    // Export to buffer
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    assert.ok(xlsxBuffer.length > 1000);

    // Read back and verify sheets and formulas
    const importedWb = XLSX.read(xlsxBuffer, { type: 'buffer', cellFormula: true });
    assert.equal(importedWb.SheetNames.length, 2);
    assert.equal(importedWb.SheetNames[0], 'Income Statement');
    assert.equal(importedWb.SheetNames[1], 'Balance Sheet');

    const sheet1 = importedWb.Sheets['Income Statement'];
    assert.equal(sheet1['A2'].v, 'Revenue');
    assert.equal(sheet1['B2'].v, 1000000);
    assert.equal(sheet1['B4'].f, 'B2-B3');
    assert.equal(sheet1['B4'].v, 600000);
  });
});
