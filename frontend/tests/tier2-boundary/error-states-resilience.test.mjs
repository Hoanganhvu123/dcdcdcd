import test from 'node:test';
import assert from 'node:assert/strict';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

test('Tier 2.5: Resilient Error Handling & Fallbacks', async (t) => {
  await t.test('T2.5.1: Mammoth convertToHtml graceful handling on invalid binary buffers', async () => {
    const corruptBuffer = Buffer.from('NOT_A_REAL_DOCX_PK_ZIP_HEADER');
    let caught = false;
    try {
      await mammoth.convertToHtml({ buffer: corruptBuffer });
    } catch (e) {
      caught = true;
      assert.ok(e.message);
    }
    assert.equal(caught, true);
  });

  await t.test('T2.5.2: SheetJS read handling on corrupt truncated zip buffer without crash', () => {
    const corruptZipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    let caught = false;
    try {
      XLSX.read(corruptZipBuffer, { type: 'buffer' });
    } catch (e) {
      caught = true;
      assert.ok(e.message);
    }
    assert.equal(caught, true);
  });

  await t.test('T2.5.3: Malformed JSON parsing fallback to raw text section', () => {
    const malformedJson = '{"name": "test", "val": ';
    function safeParse(str) {
      try {
        return { success: true, data: JSON.parse(str) };
      } catch (e) {
        return { success: false, raw: str, error: e.message };
      }
    }

    const res = safeParse(malformedJson);
    assert.equal(res.success, false);
    assert.equal(res.raw, malformedJson);
  });
});
