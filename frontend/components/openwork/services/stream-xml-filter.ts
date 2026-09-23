/**
 * SSE Stream XML Tag Filter
 * Intercepts `<think>` / `</think>` and `<tool_call>` / `</tool_call>` tags across streaming boundaries.
 * Routes thinking tokens to `onReasoningDelta` and tool call tokens to `onToolCallDelta`.
 * Emits clean, untainted prose text to `onContentDelta`.
 * Prevents XML tag leakage, incomplete tag flashes, and markdown renderer disruption.
 */

export interface ParsedToolCallPayload {
  index: number;
  id: string;
  name: string;
  argumentsDelta?: string;
  accumulatedArguments: string;
  raw?: string;
}

export interface StreamXMLFilterCallbacks {
  onContentDelta?: (delta: string, accumulated: string) => void;
  onReasoningDelta?: (delta: string, accumulated: string) => void;
  onToolCallDelta?: (delta: string, accumulated: string) => void;
  onStructuredToolCall?: (toolCall: ParsedToolCallPayload) => void;
}

export type StreamFilterState =
  | 'PROSE'
  | 'IN_THINK'
  | 'IN_TOOL_CALL'
  | 'IN_TOOL_CODE_JSON'
  | 'IN_CLOSING_FENCE';

// ============================================================================
// Python Literal & Kwargs Parser for OpenWork Engine / Server 160 tool_code
// ============================================================================

export function parsePythonLiteral(str: string): any {
  let i = 0;
  function skipWs(): void {
    while (i < str.length && /\s/.test(str[i])) i++;
  }

  function parseVal(): any {
    skipWs();
    if (i >= str.length) return null;
    const c = str[i];
    if (c === '{') return parseDict();
    if (c === '[') return parseList();
    if (c === '(') return parseTuple();
    if (c === '"' || c === "'") return parseStr();
    if (c === '-' || (c >= '0' && c <= '9')) return parseNum();
    if (c === '\\' && (str[i + 1] === '"' || str[i + 1] === "'")) {
      i++; // skip leading backslash of escaped quote
      return parseStr();
    }
    if (/[a-zA-Z_]/.test(c)) {
      let id = '';
      while (i < str.length && /[a-zA-Z0-9_]/.test(str[i])) {
        id += str[i++];
      }
      if (id === 'True') return true;
      if (id === 'False') return false;
      if (id === 'None') return null;
      return id;
    }
    i++;
    return null;
  }

  function parseStr(): string {
    const quote = str[i++];
    let isTriple = false;
    if (str[i] === quote && str[i + 1] === quote) {
      isTriple = true;
      i += 2;
    }
    let res = '';
    while (i < str.length) {
      if (isTriple) {
        if (str[i] === quote && str[i + 1] === quote && str[i + 2] === quote) {
          i += 3;
          return res;
        }
      } else {
        if (str[i] === quote) {
          i++;
          return res;
        }
      }
      if (str[i] === '\\') {
        i++;
        if (i < str.length) {
          const esc = str[i++];
          if (esc === 'n') res += '\n';
          else if (esc === 't') res += '\t';
          else if (esc === 'r') res += '\r';
          else if (esc === '\\') res += '\\';
          else if (esc === quote) res += quote;
          else if (esc === 'x') {
            const hex = str.slice(i, i + 2);
            i += 2;
            res += String.fromCharCode(parseInt(hex, 16) || 0);
          } else if (esc === 'u') {
            const hex = str.slice(i, i + 4);
            i += 4;
            res += String.fromCharCode(parseInt(hex, 16) || 0);
          } else {
            res += esc;
          }
        }
      } else {
        res += str[i++];
      }
    }
    return res;
  }

  function parseNum(): number {
    let numStr = '';
    if (str[i] === '-') numStr += str[i++];
    while (i < str.length && /[0-9.]/.test(str[i])) {
      numStr += str[i++];
    }
    return numStr.includes('.') ? parseFloat(numStr) : parseInt(numStr, 10);
  }

  function parseList(): any[] {
    i++; // skip [
    const arr: any[] = [];
    while (i < str.length) {
      skipWs();
      if (i >= str.length || str[i] === ']') {
        if (i < str.length) i++;
        return arr;
      }
      const prevI = i;
      const val = parseVal();
      arr.push(val);
      skipWs();
      if (str[i] === ',') i++;
      else if (str[i] === ']') {
        i++;
        return arr;
      }
      if (i <= prevI) i = prevI + 1;
    }
    return arr;
  }

  function parseTuple(): any[] {
    i++; // skip (
    const arr: any[] = [];
    while (i < str.length) {
      skipWs();
      if (i >= str.length || str[i] === ')') {
        if (i < str.length) i++;
        return arr;
      }
      const prevI = i;
      const val = parseVal();
      arr.push(val);
      skipWs();
      if (str[i] === ',') i++;
      else if (str[i] === ')') {
        i++;
        return arr;
      }
      if (i <= prevI) i = prevI + 1;
    }
    return arr;
  }

  function parseDict(): Record<string, any> {
    i++; // skip {
    const obj: Record<string, any> = {};
    while (i < str.length) {
      skipWs();
      if (i >= str.length || str[i] === '}') {
        if (i < str.length) i++;
        return obj;
      }
      const prevI = i;
      const key = parseVal();
      skipWs();
      if (str[i] === ':') i++;
      const val = parseVal();
      obj[String(key)] = val;
      skipWs();
      if (str[i] === ',') i++;
      else if (str[i] === '}') {
        i++;
        return obj;
      }
      if (i <= prevI) i = prevI + 1;
    }
    return obj;
  }

  function parseKwargs(): Record<string, any> {
    skipWs();
    if (i >= str.length) return {};
    if (str[i] === '{') return parseDict();
    const args: Record<string, any> = {};
    while (i < str.length) {
      skipWs();
      if (i >= str.length) break;
      const mark = i;
      let ident = '';
      while (i < str.length && /[a-zA-Z0-9_]/.test(str[i])) {
        ident += str[i++];
      }
      skipWs();
      if (ident && str[i] === '=') {
        i++; // skip =
        const val = parseVal();
        args[ident] = val;
      } else {
        i = mark;
        const val = parseVal();
        if (typeof val === 'object' && val !== null) {
          Object.assign(args, val);
        } else if (typeof val === 'string') {
          args['text'] = val;
        }
      }
      skipWs();
      if (str[i] === ',') i++;
      if (i <= mark) {
        i = mark + 1;
      }
    }
    return args;
  }

  return parseKwargs();
}

/**
 * Extracts tool name and arguments from raw JSON or Python function invocation
 */
export function parseToolCallSyntax(
  rawText: string
): { name: string; args: any; argumentsStr: string } | null {
  if (!rawText || typeof rawText !== 'string') return null;
  let text = rawText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json|python)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  let toolCodeStr = '';
  let directName = '';
  let directArgs: any = null;

  try {
    const normalized = text.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === 'object') {
      if (parsed.tool_code) {
        toolCodeStr = String(parsed.tool_code);
      } else if (parsed.tool_call) {
        toolCodeStr = typeof parsed.tool_call === 'string' ? parsed.tool_call : JSON.stringify(parsed.tool_call);
      } else if (parsed.name) {
        directName = parsed.name;
        directArgs = parsed.arguments || parsed.args || parsed.parameters || {};
      }
    }
  } catch {
    const m = text.match(/"tool_code"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (m) {
      try {
        const sanitized = m[1].replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
        toolCodeStr = JSON.parse('"' + sanitized + '"');
      } catch {
        toolCodeStr = m[1]
          .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16) || 0))
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
          .replace(/\\\\/g, '\\');
      }
    }
  }

  if (directName) {
    const argsStr = typeof directArgs === 'string' ? directArgs : JSON.stringify(directArgs);
    let parsedObj = typeof directArgs === 'string' ? null : directArgs;
    if (!parsedObj) {
      try {
        parsedObj = JSON.parse(argsStr);
      } catch {
        parsedObj = {};
      }
    }
    return { name: directName, args: parsedObj, argumentsStr: argsStr };
  }

  if (!toolCodeStr) {
    toolCodeStr = text;
  }

  let cleaned = toolCodeStr.trim();
  if (cleaned.startsWith('print(') && cleaned.endsWith(')')) {
    cleaned = cleaned.slice(6, -1).trim();
  }

  const funcMatch = cleaned.match(/^([a-zA-Z0-9_]+)\s*\(([\s\S]*)\)$/);
  if (!funcMatch) {
    return null;
  }

  const toolName = funcMatch[1];
  const rawArgs = funcMatch[2].trim();
  const parsedArgs = parsePythonLiteral(rawArgs);

  if (toolName.includes('sql') || toolName.includes('query')) {
    if (parsedArgs.text && !parsedArgs.sql && !parsedArgs.query) {
      parsedArgs.sql = parsedArgs.text;
    }
  }

  const argumentsStr = JSON.stringify(parsedArgs);

  return { name: toolName, args: parsedArgs, argumentsStr };
}

export class StreamXMLFilter {
  private state: StreamFilterState = 'PROSE';
  private tagBuffer: string = '';
  private jsonBuffer: string = '';
  private fenceBuffer: string = '';
  private toolJsonBuffer: string = '';
  private closingFenceBuffer: string = '';
  private hasFence: boolean = false;
  private braceDepth: number = 0;
  private inString: boolean = false;
  private stringQuote: string = '';
  private escaped: boolean = false;

  private accumulatedContent: string = '';
  private accumulatedReasoning: string = '';
  private accumulatedToolCall: string = '';

  private toolCallIndex: number = 0;
  private toolCallCount: number = 0;
  private emittedInitialToolCall: boolean = false;
  private currentToolCallId: string = '';

  private callbacks: StreamXMLFilterCallbacks;

  // Known target tags
  public static readonly THINK_OPEN = '<think>';
  public static readonly THINK_CLOSE = '</think>';
  public static readonly TOOL_OPEN = '<tool_call>';
  public static readonly TOOL_CLOSE = '</tool_call>';

  constructor(callbacks: StreamXMLFilterCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Ingest an incoming text chunk from the SSE stream.
   */
  public push(chunk: string): void {
    if (!chunk) return;

    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      this.processChar(char);
    }
  }

  private processChar(char: string): void {
    if (this.state === 'PROSE') {
      // 1. XML tag buffer
      if (this.tagBuffer.length > 0) {
        this.tagBuffer += char;
        if (this.tagBuffer === StreamXMLFilter.THINK_OPEN) {
          this.state = 'IN_THINK';
          this.tagBuffer = '';
        } else if (this.tagBuffer === StreamXMLFilter.TOOL_OPEN) {
          this.state = 'IN_TOOL_CALL';
          this.tagBuffer = '';
        } else if (
          !StreamXMLFilter.THINK_OPEN.startsWith(this.tagBuffer) &&
          !StreamXMLFilter.TOOL_OPEN.startsWith(this.tagBuffer)
        ) {
          this.emitContent(this.tagBuffer);
          this.tagBuffer = '';
        }
        return;
      }

      // 2. Code fence buffer (for ```json / ``` wrapping tool_code)
      if (this.fenceBuffer.length > 0) {
        const fenceMatch = /^```(?:json|python)?[\s\r\n]*$/i;
        const fencePrefix = /^`{1,3}(?:j?s?o?n?|p?y?t?h?o?n?)?[\s\r\n]*$/i;

        if (char === '{' && fenceMatch.test(this.fenceBuffer)) {
          this.hasFence = true;
          this.jsonBuffer = '{';
          this.fenceBuffer = '';
          return;
        }

        this.fenceBuffer += char;
        if (!fencePrefix.test(this.fenceBuffer)) {
          this.emitContent(this.fenceBuffer);
          this.fenceBuffer = '';
        }
        return;
      }

      // 3. JSON buffer for candidate tool invocation
      if (this.jsonBuffer.length > 0) {
        this.jsonBuffer += char;
        const toolPossible = /^\s*\{\s*("t?o?o?l?_?(c?o?d?e?|c?a?l?l?s?)?"?|'t?o?o?l?_?(c?o?d?e?|c?a?l?l?s?)?'?)?$/;
        const toolDefinite = /^\s*\{\s*("tool_code"|'tool_code'|"tool_call"|'tool_call'|"tool_calls"|'tool_calls')/;

        if (toolDefinite.test(this.jsonBuffer)) {
          this.state = 'IN_TOOL_CODE_JSON';
          this.toolJsonBuffer = this.jsonBuffer;
          this.jsonBuffer = '';
          this.braceDepth = 1;
          this.inString = false;
          this.stringQuote = '';
          this.escaped = false;
          this.emittedInitialToolCall = false;
          this.currentToolCallId = `call_${this.toolCallCount++}_${Date.now()}`;
          return;
        } else if (toolPossible.test(this.jsonBuffer)) {
          return;
        } else {
          if (this.hasFence) {
            this.emitContent('```json\n');
            this.hasFence = false;
          }
          this.emitContent(this.jsonBuffer);
          this.jsonBuffer = '';
          return;
        }
      }

      // Normal prose character
      if (char === '<') {
        this.tagBuffer = '<';
      } else if (char === '`') {
        this.fenceBuffer = '`';
      } else if (char === '{') {
        this.jsonBuffer = '{';
      } else {
        this.emitContent(char);
      }
    } else if (this.state === 'IN_THINK') {
      if (this.tagBuffer.length > 0) {
        this.tagBuffer += char;
        if (this.tagBuffer === StreamXMLFilter.THINK_CLOSE) {
          this.state = 'PROSE';
          this.tagBuffer = '';
        } else if (!StreamXMLFilter.THINK_CLOSE.startsWith(this.tagBuffer)) {
          this.emitReasoning(this.tagBuffer);
          this.tagBuffer = '';
        }
      } else {
        if (char === '<') {
          this.tagBuffer = '<';
        } else {
          this.emitReasoning(char);
        }
      }
    } else if (this.state === 'IN_TOOL_CALL') {
      if (this.tagBuffer.length > 0) {
        this.tagBuffer += char;
        if (this.tagBuffer === StreamXMLFilter.TOOL_CLOSE) {
          this.state = 'PROSE';
          this.tagBuffer = '';
          const parsed = parseToolCallSyntax(this.accumulatedToolCall);
          if (parsed) {
            this.callbacks.onStructuredToolCall?.({
              index: this.toolCallIndex++,
              id: `call_${this.toolCallCount++}_${Date.now()}`,
              name: parsed.name,
              argumentsDelta: parsed.argumentsStr,
              accumulatedArguments: parsed.argumentsStr,
              raw: this.accumulatedToolCall,
            });
          }
        } else if (!StreamXMLFilter.TOOL_CLOSE.startsWith(this.tagBuffer)) {
          this.emitToolCall(this.tagBuffer);
          this.tagBuffer = '';
        }
      } else {
        if (char === '<') {
          this.tagBuffer = '<';
        } else {
          this.emitToolCall(char);
        }
      }
    } else if (this.state === 'IN_TOOL_CODE_JSON') {
      this.toolJsonBuffer += char;

      if (!this.emittedInitialToolCall) {
        const m = this.toolJsonBuffer.match(
          /"tool_code"\s*:\s*"?\s*(?:print\s*\(\s*)?([a-zA-Z0-9_]+)\s*\(/
        );
        if (m && m[1] && m[1] !== 'print') {
          this.emittedInitialToolCall = true;
          this.callbacks.onStructuredToolCall?.({
            index: this.toolCallIndex,
            id: this.currentToolCallId,
            name: m[1],
            argumentsDelta: '',
            accumulatedArguments: '',
            raw: this.toolJsonBuffer,
          });
        }
      }

      if (this.escaped) {
        this.escaped = false;
      } else if (this.inString) {
        if (char === '\\') {
          this.escaped = true;
        } else if (char === this.stringQuote) {
          this.inString = false;
          this.stringQuote = '';
        }
      } else {
        if (char === '"' || char === "'") {
          this.inString = true;
          this.stringQuote = char;
        } else if (char === '{') {
          this.braceDepth++;
        } else if (char === '}') {
          this.braceDepth--;
          if (this.braceDepth === 0) {
            if (this.hasFence) {
              this.state = 'IN_CLOSING_FENCE';
              this.closingFenceBuffer = '';
            } else {
              this.finishToolCode();
              this.state = 'PROSE';
            }
          }
        }
      }
    } else if (this.state === 'IN_CLOSING_FENCE') {
      this.closingFenceBuffer += char;
      if (this.closingFenceBuffer.includes('```')) {
        this.finishToolCode();
        this.state = 'PROSE';
      } else if (this.closingFenceBuffer.length > 30 || !/\s|`/.test(char)) {
        this.finishToolCode();
        this.state = 'PROSE';
        this.emitContent(char);
      }
    }
  }

  private finishToolCode(): void {
    const raw = this.toolJsonBuffer;
    this.emitToolCall(raw);
    const parsed = parseToolCallSyntax(raw);
    if (parsed) {
      this.callbacks.onStructuredToolCall?.({
        index: this.toolCallIndex++,
        id: this.currentToolCallId || `call_${this.toolCallCount++}_${Date.now()}`,
        name: parsed.name,
        argumentsDelta: parsed.argumentsStr,
        accumulatedArguments: parsed.argumentsStr,
        raw,
      });
    }
    this.toolJsonBuffer = '';
    this.closingFenceBuffer = '';
    this.hasFence = false;
    this.emittedInitialToolCall = false;
  }

  /**
   * Flush any remaining buffered characters when the stream finishes.
   */
  public flush(): void {
    if (this.tagBuffer.length > 0) {
      if (this.state === 'PROSE') {
        this.emitContent(this.tagBuffer);
      } else if (this.state === 'IN_THINK') {
        this.emitReasoning(this.tagBuffer);
      } else if (this.state === 'IN_TOOL_CALL') {
        this.emitToolCall(this.tagBuffer);
      }
      this.tagBuffer = '';
    }
    if (this.fenceBuffer.length > 0) {
      this.emitContent(this.fenceBuffer);
      this.fenceBuffer = '';
    }
    if (this.jsonBuffer.length > 0) {
      this.emitContent(this.jsonBuffer);
      this.jsonBuffer = '';
    }
    if (this.state === 'IN_TOOL_CODE_JSON' && this.toolJsonBuffer.length > 0) {
      this.finishToolCode();
      this.state = 'PROSE';
    }
    if (this.state === 'IN_CLOSING_FENCE') {
      this.finishToolCode();
      this.state = 'PROSE';
    }
  }

  public getAccumulatedContent(): string {
    return this.accumulatedContent;
  }

  public getAccumulatedReasoning(): string {
    return this.accumulatedReasoning;
  }

  public getAccumulatedToolCall(): string {
    return this.accumulatedToolCall;
  }

  public getState(): StreamFilterState {
    return this.state;
  }

  public reset(): void {
    this.state = 'PROSE';
    this.tagBuffer = '';
    this.jsonBuffer = '';
    this.fenceBuffer = '';
    this.toolJsonBuffer = '';
    this.closingFenceBuffer = '';
    this.hasFence = false;
    this.braceDepth = 0;
    this.inString = false;
    this.stringQuote = '';
    this.escaped = false;
    this.accumulatedContent = '';
    this.accumulatedReasoning = '';
    this.accumulatedToolCall = '';
    this.toolCallIndex = 0;
    this.toolCallCount = 0;
    this.emittedInitialToolCall = false;
    this.currentToolCallId = '';
  }

  private emitContent(text: string): void {
    this.accumulatedContent += text;
    this.callbacks.onContentDelta?.(text, this.accumulatedContent);
  }

  private emitReasoning(text: string): void {
    this.accumulatedReasoning += text;
    this.callbacks.onReasoningDelta?.(text, this.accumulatedReasoning);
  }

  private emitToolCall(text: string): void {
    this.accumulatedToolCall += text;
    this.callbacks.onToolCallDelta?.(text, this.accumulatedToolCall);
  }
}

/**
 * Filter an entire string for offline or batch processing.
 */
export function filterXMLTagsSync(text: string): {
  content: string;
  reasoning: string;
  toolCalls: string[];
  structuredToolCalls: ParsedToolCallPayload[];
} {
  let content = '';
  let reasoning = '';
  const toolCalls: string[] = [];
  const structuredToolCalls: ParsedToolCallPayload[] = [];

  const filter = new StreamXMLFilter({
    onContentDelta: (delta) => {
      content += delta;
    },
    onReasoningDelta: (delta) => {
      reasoning += delta;
    },
    onToolCallDelta: (delta) => {
      if (toolCalls.length === 0) toolCalls.push('');
      toolCalls[toolCalls.length - 1] += delta;
    },
    onStructuredToolCall: (stc) => {
      structuredToolCalls.push(stc);
    },
  });

  filter.push(text);
  filter.flush();

  return { content, reasoning, toolCalls, structuredToolCalls };
}
