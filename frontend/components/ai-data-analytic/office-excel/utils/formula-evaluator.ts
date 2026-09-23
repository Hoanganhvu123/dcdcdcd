/**
 * Lightweight in-memory formula evaluation engine for Excel XLSX spreadsheets.
 * Supports SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, VLOOKUP, IF,
 * arithmetic expressions (+, -, *, /, ^, %), comparisons (<, >, <=, >=, =, <>),
 * and cross-sheet references.
 * Secure AST recursive-descent arithmetic evaluator with zero code execution.
 */

import type { ExcelSheetData } from '../types';

export function colLetterToIndex(colStr: string): number {
  let index = 0;
  const upper = colStr.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index - 1; // 0-based
}

export function indexToColLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export interface CellCoord {
  sheetName?: string;
  col: number; // 0-based
  row: number; // 0-based
}

export function parseCellAddress(addr: string): CellCoord | null {
  const match = addr.trim().match(/^(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const sheetName = match[1] || match[2];
  const colStr = match[3];
  const rowStr = match[4];
  return {
    sheetName,
    col: colLetterToIndex(colStr),
    row: parseInt(rowStr, 10) - 1,
  };
}

export function parseRange(rangeStr: string): { start: CellCoord; end: CellCoord } | null {
  const parts = rangeStr.split(':');
  if (parts.length !== 2) return null;
  const start = parseCellAddress(parts[0]);
  if (!start) return null;
  
  let endStr = parts[1].trim();
  // If end doesn't have sheet name but start does, inherit sheet name
  if (start.sheetName && !endStr.includes('!')) {
    endStr = `${start.sheetName}!${endStr}`;
  }
  const end = parseCellAddress(endStr);
  if (!end) return null;

  return { start, end };
}

function resolveSheetRows(
  sheetName: string | undefined,
  currentRows: (string | number)[][],
  allSheets?: ExcelSheetData[]
): (string | number)[][] {
  if (!sheetName || !allSheets) return currentRows;
  const found = allSheets.find(
    (s) => s.name.toLowerCase() === sheetName.toLowerCase()
  );
  return found ? found.rows : currentRows;
}

function cleanNumericValue(val: any): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function getCellValue(
  coord: CellCoord,
  currentRows: (string | number)[][],
  allSheets?: ExcelSheetData[],
  visited = new Set<string>()
): any {
  const rows = resolveSheetRows(coord.sheetName, currentRows, allSheets);
  const row = rows[coord.row];
  if (!row) return '';
  const rawVal = row[coord.col];
  if (rawVal === undefined || rawVal === null) return '';

  if (typeof rawVal === 'string' && rawVal.startsWith('=')) {
    const key = `${coord.sheetName || 'CURRENT'}!${indexToColLetter(coord.col)}${coord.row + 1}`;
    if (visited.has(key)) return '#CIRCULAR!';
    visited.add(key);
    return evaluateFormula(rawVal, rows, allSheets, visited);
  }

  return rawVal;
}

export function getRangeValues(
  rangeStr: string,
  currentRows: (string | number)[][],
  allSheets?: ExcelSheetData[],
  visited = new Set<string>()
): any[] {
  const parsed = parseRange(rangeStr);
  if (!parsed) {
    // Maybe single cell
    const single = parseCellAddress(rangeStr);
    if (single) return [getCellValue(single, currentRows, allSheets, visited)];
    return [];
  }

  const { start, end } = parsed;
  const rows = resolveSheetRows(start.sheetName, currentRows, allSheets);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);

  const values: any[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = minCol; c <= maxCol; c++) {
      const coord: CellCoord = { sheetName: start.sheetName, row: r, col: c };
      values.push(getCellValue(coord, currentRows, allSheets, visited));
    }
  }
  return values;
}

/**
 * Safe Recursive-Descent Parser for Arithmetic and Comparison Expressions.
 * Guarantees zero code execution.
 */
export function evaluateSafeArithmetic(expr: string): number | boolean | string {
  let pos = 0;
  const input = expr.trim();

  function peek(): string {
    while (pos < input.length && /\s/.test(input[pos])) pos++;
    return pos < input.length ? input[pos] : '';
  }

  function peekWord(len: number): string {
    while (pos < input.length && /\s/.test(input[pos])) pos++;
    return input.slice(pos, pos + len);
  }

  function consume(expected?: string): string {
    while (pos < input.length && /\s/.test(input[pos])) pos++;
    if (pos >= input.length) {
      if (expected) throw new Error(`Expected '${expected}'`);
      return '';
    }
    const char = input[pos];
    if (expected && char !== expected) {
      throw new Error(`Expected '${expected}' but found '${char}'`);
    }
    pos++;
    return char;
  }

  function parseExpression(): number | boolean {
    return parseComparison();
  }

  function parseComparison(): number | boolean {
    let left: any = parseAdditive();
    while (true) {
      const two = peekWord(2);
      if (two === '<=' || two === '>=' || two === '<>' || two === '!=' || two === '==') {
        pos += 2;
        const right: any = parseAdditive();
        if (two === '<=') left = left <= right;
        else if (two === '>=') left = left >= right;
        else if (two === '<>' || two === '!=') left = left !== right;
        else if (two === '==') left = left === right;
        continue;
      }
      const one = peek();
      if (one === '<' || one === '>' || one === '=') {
        pos += 1;
        const right: any = parseAdditive();
        if (one === '<') left = left < right;
        else if (one === '>') left = left > right;
        else if (one === '=') left = left === right;
        continue;
      }
      break;
    }
    return left;
  }

  function parseAdditive(): number {
    let left = parseMultiplicative();
    while (true) {
      const next = peek();
      if (next === '+') {
        consume('+');
        left = left + parseMultiplicative();
      } else if (next === '-') {
        consume('-');
        left = left - parseMultiplicative();
      } else {
        break;
      }
    }
    return left;
  }

  function parseMultiplicative(): number {
    let left = parsePower();
    while (true) {
      const next = peek();
      if (next === '*') {
        consume('*');
        left = left * parsePower();
      } else if (next === '/') {
        consume('/');
        const right = parsePower();
        if (right === 0 || !isFinite(right) || Math.abs(right) < 1e-15) {
          throw new Error('#DIV/0!');
        }
        left = left / right;
      } else {
        break;
      }
    }
    return left;
  }

  function parsePower(): number {
    const base = parsePostfix();
    if (peek() === '^') {
      consume('^');
      const exponent = parsePower(); // right-associative power
      const res = Math.pow(base, exponent);
      if (!isFinite(res) || isNaN(res)) throw new Error('#VALUE!');
      return res;
    }
    return base;
  }

  function parsePostfix(): number {
    let val = parsePrimary();
    while (peek() === '%') {
      consume('%');
      val = val / 100;
    }
    return val;
  }

  function parsePrimary(): number {
    const next = peek();

    if (next === '+') {
      consume('+');
      return parsePrimary();
    }
    if (next === '-') {
      consume('-');
      return -parsePrimary();
    }

    if (next === '(') {
      consume('(');
      const val = parseExpression();
      consume(')');
      return typeof val === 'boolean' ? (val ? 1 : 0) : val;
    }

    const remaining = input.slice(pos);
    const numMatch = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(remaining);
    if (numMatch) {
      pos += numMatch[0].length;
      const parsed = parseFloat(numMatch[0]);
      if (isNaN(parsed)) throw new Error('#VALUE!');
      return parsed;
    }

    throw new Error('#ERROR!');
  }

  try {
    const result = parseExpression();
    while (pos < input.length && /\s/.test(input[pos])) pos++;
    if (pos < input.length) {
      return '#ERROR!';
    }
    if (typeof result === 'number') {
      if (!isFinite(result)) return '#DIV/0!';
      if (isNaN(result)) return '#VALUE!';
      return Math.round(result * 10000) / 10000;
    }
    return result;
  } catch (err: any) {
    if (err?.message === '#DIV/0!') return '#DIV/0!';
    if (err?.message === '#VALUE!') return '#VALUE!';
    return '#ERROR!';
  }
}

export function evaluateFormula(
  formula: string,
  currentRows: (string | number)[][],
  allSheets?: ExcelSheetData[],
  visited = new Set<string>()
): string | number | boolean {
  if (!formula || typeof formula !== 'string') return '';
  const isFormulaExpr = formula.trim().startsWith('=');
  let expr = formula.trim();
  if (expr.startsWith('=')) expr = expr.substring(1).trim();

  // If string literal in quotes, unquote and return
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }

  // 1. Check for standard Excel functions (case-insensitive)
  const fnMatch = expr.match(/^([A-Za-z_]+)\s*\((.*)\)$/s);
  if (fnMatch) {
    const fnName = fnMatch[1].toUpperCase();
    const argsStr = fnMatch[2].trim();

    // Helper to split arguments while respecting nested parentheses and strings
    const args: string[] = [];
    let depth = 0;
    let inQuotes = false;
    let currentArg = '';
    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      if (char === '"' || char === "'") inQuotes = !inQuotes;
      else if (!inQuotes && char === '(') depth++;
      else if (!inQuotes && char === ')') depth--;
      else if (!inQuotes && char === ',' && depth === 0) {
        args.push(currentArg.trim());
        currentArg = '';
        continue;
      }
      currentArg += char;
    }
    if (currentArg.trim()) args.push(currentArg.trim());

    if (fnName === 'SUM') {
      let sum = 0;
      for (const arg of args) {
        if (arg.includes(':')) {
          const vals = getRangeValues(arg, currentRows, allSheets, visited);
          vals.forEach((v) => {
            const num = cleanNumericValue(v);
            if (num !== null) sum += num;
          });
        } else {
          const single = parseCellAddress(arg);
          const v = single ? getCellValue(single, currentRows, allSheets, visited) : evaluateFormula(arg, currentRows, allSheets, visited);
          const num = cleanNumericValue(v);
          if (num !== null) sum += num;
        }
      }
      return sum;
    }

    if (fnName === 'AVERAGE') {
      let sum = 0;
      let count = 0;
      for (const arg of args) {
        if (arg.includes(':')) {
          const vals = getRangeValues(arg, currentRows, allSheets, visited);
          vals.forEach((v) => {
            const num = cleanNumericValue(v);
            if (num !== null) {
              sum += num;
              count++;
            }
          });
        } else {
          const single = parseCellAddress(arg);
          const v = single ? getCellValue(single, currentRows, allSheets, visited) : evaluateFormula(arg, currentRows, allSheets, visited);
          const num = cleanNumericValue(v);
          if (num !== null) {
            sum += num;
            count++;
          }
        }
      }
      return count === 0 ? '#DIV/0!' : sum / count;
    }

    if (fnName === 'MIN') {
      let min: number | null = null;
      for (const arg of args) {
        const vals = arg.includes(':') ? getRangeValues(arg, currentRows, allSheets, visited) : [getCellValue(parseCellAddress(arg) || { row: 0, col: 0 }, currentRows, allSheets, visited)];
        vals.forEach((v) => {
          const num = cleanNumericValue(v);
          if (num !== null) {
            min = min === null ? num : Math.min(min, num);
          }
        });
      }
      return min === null ? 0 : min;
    }

    if (fnName === 'MAX') {
      let max: number | null = null;
      for (const arg of args) {
        const vals = arg.includes(':') ? getRangeValues(arg, currentRows, allSheets, visited) : [getCellValue(parseCellAddress(arg) || { row: 0, col: 0 }, currentRows, allSheets, visited)];
        vals.forEach((v) => {
          const num = cleanNumericValue(v);
          if (num !== null) {
            max = max === null ? num : Math.max(max, num);
          }
        });
      }
      return max === null ? 0 : max;
    }

    if (fnName === 'COUNT') {
      let count = 0;
      for (const arg of args) {
        const vals = arg.includes(':') ? getRangeValues(arg, currentRows, allSheets, visited) : [getCellValue(parseCellAddress(arg) || { row: 0, col: 0 }, currentRows, allSheets, visited)];
        vals.forEach((v) => {
          if (cleanNumericValue(v) !== null) count++;
        });
      }
      return count;
    }

    if (fnName === 'COUNTA') {
      let count = 0;
      for (const arg of args) {
        const vals = arg.includes(':') ? getRangeValues(arg, currentRows, allSheets, visited) : [getCellValue(parseCellAddress(arg) || { row: 0, col: 0 }, currentRows, allSheets, visited)];
        vals.forEach((v) => {
          if (v !== '' && v !== null && v !== undefined) count++;
        });
      }
      return count;
    }

    if (fnName === 'ROUND') {
      if (args.length < 1) return '#VALUE!';
      const valArg = evaluateFormula(args[0], currentRows, allSheets, visited);
      const val = cleanNumericValue(valArg);
      if (val === null) return '#VALUE!';
      const decimals = args.length > 1 ? parseInt(String(evaluateFormula(args[1], currentRows, allSheets, visited)), 10) || 0 : 0;
      const factor = Math.pow(10, decimals);
      return Math.round(val * factor) / factor;
    }

    if (fnName === 'IF') {
      if (args.length < 2) return '#VALUE!';
      const conditionRes = evaluateFormula(args[0], currentRows, allSheets, visited);
      const isTrue = conditionRes === true || conditionRes === 'TRUE' || conditionRes === 1 || (typeof conditionRes === 'number' && conditionRes !== 0);
      if (isTrue) {
        return evaluateFormula(args[1], currentRows, allSheets, visited);
      }
      return args.length > 2 ? evaluateFormula(args[2], currentRows, allSheets, visited) : false;
    }

    if (fnName === 'VLOOKUP') {
      if (args.length < 3) return '#N/A';
      const rawLookup = args[0].replace(/^["']|["']$/g, '');
      const lookupVal = parseCellAddress(args[0])
        ? getCellValue(parseCellAddress(args[0])!, currentRows, allSheets, visited)
        : rawLookup;

      const rangeParsed = parseRange(args[1]);
      if (!rangeParsed) return '#REF!';
      const { start, end } = rangeParsed;
      const colIndex = parseInt(args[2], 10);
      if (isNaN(colIndex) || colIndex < 1) return '#VALUE!';

      const targetRows = resolveSheetRows(start.sheetName, currentRows, allSheets);
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const lookupCol = Math.min(start.col, end.col);
      const returnCol = lookupCol + (colIndex - 1);

      const searchStr = String(lookupVal).trim().toLowerCase();
      for (let r = minRow; r <= maxRow; r++) {
        const row = targetRows[r];
        if (!row) continue;
        const cellVal = String(row[lookupCol] ?? '').trim().toLowerCase();
        if (cellVal === searchStr) {
          return row[returnCol] ?? '';
        }
      }
      return '#N/A';
    }
  }

  // 2. Evaluate algebraic expression with cell addresses (e.g. (C2-B2)/B2, B2*1.1, B2 > 500)
  try {
    // Replace cell references in expression with their numeric or evaluated values
    const evaluatedExpr = expr.replace(/(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?([A-Za-z]+)(\d+)/g, (match) => {
      const coord = parseCellAddress(match);
      if (!coord) return '0';
      const val = getCellValue(coord, currentRows, allSheets, visited);
      const num = cleanNumericValue(val);
      return num !== null ? String(num) : `"${String(val).replace(/"/g, '\\"')}"`;
    });

    // Safe mathematical / comparison evaluation
    if (/^[0-9+\-*/().^ %eE=<>!\s]+$/.test(evaluatedExpr)) {
      return evaluateSafeArithmetic(evaluatedExpr);
    }
  } catch {
    return '#ERROR!';
  }

  // If expression was explicitly a formula (started with =) and could not be evaluated, return error
  if (isFormulaExpr) {
    return '#ERROR!';
  }

  return expr;
}

export function evaluateCellFormula(
  cellValue: any,
  currentRows: (string | number)[][],
  allSheets?: ExcelSheetData[],
  formulasMap?: Record<string, string>,
  cellCoord?: string
): any {
  if (cellCoord && formulasMap && formulasMap[cellCoord]) {
    return evaluateFormula(formulasMap[cellCoord], currentRows, allSheets);
  }
  if (typeof cellValue === 'string' && cellValue.startsWith('=')) {
    return evaluateFormula(cellValue, currentRows, allSheets);
  }
  return cellValue;
}
