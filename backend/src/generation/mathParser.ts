enum TokenType {
  NUMBER,
  VARIABLE,
  PLUS,
  MINUS,
  STAR,
  SLASH,
  MOD,
  CARET,
  EQ,
  NEQ,
  LT,
  GT,
  LTE,
  GTE,
  LOGICAL_OR,
  LOGICAL_AND,
  LOGICAL_NOT,
  QUESTION,
  COLON,
  LPAREN,
  RPAREN,
  LBRACKET,
  RBRACKET,
  COMMA,
  FUNCTION,
  EOF,
}

interface Token {
  type: TokenType;
  value?: string | number;
}

const FUNCTION_NAMES = new Set(['ceil', 'floor', 'abs', 'sqrt']);
const RESERVED_WORDS = new Map<string, number | boolean>([
  ['true', true],
  ['false', false],
]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/\d/.test(ch)) {
      let numStr = '';
      while (i < input.length && (/\d/.test(input[i]) || input[i] === '.')) {
        numStr += input[i];
        i++;
      }
      tokens.push({ type: TokenType.NUMBER, value: parseFloat(numStr) });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let name = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        name += input[i];
        i++;
      }
      if (FUNCTION_NAMES.has(name)) {
        tokens.push({ type: TokenType.FUNCTION, value: name });
      } else if (RESERVED_WORDS.has(name)) {
        const val = RESERVED_WORDS.get(name)!;
        if (typeof val === 'boolean') {
          tokens.push({ type: TokenType.NUMBER, value: val ? 1 : 0 });
        } else {
          tokens.push({ type: TokenType.NUMBER, value: val });
        }
      } else {
        tokens.push({ type: TokenType.VARIABLE, value: name });
      }
      continue;
    }

    if (ch === '|' && i + 1 < input.length && input[i + 1] === '|') {
      tokens.push({ type: TokenType.LOGICAL_OR });
      i += 2;
      continue;
    }
    if (ch === '&' && i + 1 < input.length && input[i + 1] === '&') {
      tokens.push({ type: TokenType.LOGICAL_AND });
      i += 2;
      continue;
    }
    if (ch === '<' && i + 1 < input.length && input[i + 1] === '=') {
      tokens.push({ type: TokenType.LTE });
      i += 2;
      continue;
    }
    if (ch === '>' && i + 1 < input.length && input[i + 1] === '=') {
      tokens.push({ type: TokenType.GTE });
      i += 2;
      continue;
    }
    if (ch === '=' && i + 1 < input.length && input[i + 1] === '=') {
      tokens.push({ type: TokenType.EQ });
      i += 2;
      continue;
    }
    if (ch === '!' && i + 1 < input.length && input[i + 1] === '=') {
      tokens.push({ type: TokenType.NEQ });
      i += 2;
      continue;
    }

    if (ch === '<') {
      tokens.push({ type: TokenType.LT });
      i++;
      continue;
    }
    if (ch === '>') {
      tokens.push({ type: TokenType.GT });
      i++;
      continue;
    }
    if (ch === '!') {
      tokens.push({ type: TokenType.LOGICAL_NOT });
      i++;
      continue;
    }

    if (ch === '+') {
      tokens.push({ type: TokenType.PLUS });
      i++;
      continue;
    }
    if (ch === '-') {
      tokens.push({ type: TokenType.MINUS });
      i++;
      continue;
    }
    if (ch === '*') {
      tokens.push({ type: TokenType.STAR });
      i++;
      continue;
    }
    if (ch === '/') {
      tokens.push({ type: TokenType.SLASH });
      i++;
      continue;
    }
    if (ch === '%') {
      tokens.push({ type: TokenType.MOD });
      i++;
      continue;
    }
    if (ch === '^') {
      tokens.push({ type: TokenType.CARET });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: TokenType.LPAREN });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: TokenType.RPAREN });
      i++;
      continue;
    }
    if (ch === '[') {
      tokens.push({ type: TokenType.LBRACKET });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: TokenType.RBRACKET });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: TokenType.COMMA });
      i++;
      continue;
    }
    if (ch === '?') {
      tokens.push({ type: TokenType.QUESTION });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: TokenType.COLON });
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: TokenType.EOF });
  return tokens;
}

abstract class Node {}

class NumberLiteral extends Node {
  constructor(public value: number) {
    super();
  }
}

class VariableNode extends Node {
  constructor(public name: string) {
    super();
  }
}

class BinaryOp extends Node {
  constructor(public left: Node, public op: TokenType, public right: Node) {
    super();
  }
}

class UnaryOp extends Node {
  constructor(public op: TokenType, public operand: Node) {
    super();
  }
}

class TernaryOp extends Node {
  constructor(
    public condition: Node,
    public trueExpr: Node,
    public falseExpr: Node,
  ) {
    super();
  }
}

class FunctionCall extends Node {
  constructor(public name: string, public argument: Node) {
    super();
  }
}

class ListNode extends Node {
  constructor(public elements: Node[]) {
    super();
  }
}

class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Node {
    const result = this.expression();
    if (!this.isAtEnd()) {
      const tok = this.peek();
      throw new Error(
        `Unexpected token '${tok.value ?? tok.type}' at position ${this.current}`,
      );
    }
    return result;
  }

  private expression(): Node {
    return this.logicalOr();
  }

  private logicalOr(): Node {
    let expr = this.logicalAnd();
    while (this.match(TokenType.LOGICAL_OR)) {
      const right = this.logicalAnd();
      expr = new BinaryOp(expr, TokenType.LOGICAL_OR, right);
    }
    return expr;
  }

  private logicalAnd(): Node {
    let expr = this.ternary();
    while (this.match(TokenType.LOGICAL_AND)) {
      const right = this.ternary();
      expr = new BinaryOp(expr, TokenType.LOGICAL_AND, right);
    }
    return expr;
  }

  private ternary(): Node {
    let expr = this.comparison();
    if (this.match(TokenType.QUESTION)) {
      const trueExpr = this.expression();
      this.consume(TokenType.COLON, "Expected ':' for ternary operator");
      const falseExpr = this.ternary();
      expr = new TernaryOp(expr, trueExpr, falseExpr);
    }
    return expr;
  }

  private comparison(): Node {
    let expr = this.addition();
    while (
      this.match(
        TokenType.EQ,
        TokenType.NEQ,
        TokenType.LT,
        TokenType.GT,
        TokenType.LTE,
        TokenType.GTE,
      )
    ) {
      const op = this.previous().type;
      const right = this.addition();
      expr = new BinaryOp(expr, op, right);
    }
    return expr;
  }

  private addition(): Node {
    let expr = this.multiplication();
    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const op = this.previous().type;
      const right = this.multiplication();
      expr = new BinaryOp(expr, op, right);
    }
    return expr;
  }

  private multiplication(): Node {
    let expr = this.unary();
    while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.MOD)) {
      const op = this.previous().type;
      const right = this.unary();
      expr = new BinaryOp(expr, op, right);
    }
    return expr;
  }

  private unary(): Node {
    if (this.match(TokenType.MINUS, TokenType.LOGICAL_NOT)) {
      const op = this.previous().type;
      const operand = this.unary();
      return new UnaryOp(op, operand);
    }
    return this.exponent();
  }

  private exponent(): Node {
    let expr = this.primary();
    if (this.match(TokenType.CARET)) {
      const right = this.exponent();
      expr = new BinaryOp(expr, TokenType.CARET, right);
    }
    return expr;
  }

  private primary(): Node {
    if (this.match(TokenType.NUMBER)) {
      return new NumberLiteral(this.previous().value as number);
    }

    if (this.match(TokenType.VARIABLE)) {
      return new VariableNode(this.previous().value as string);
    }

    if (this.match(TokenType.FUNCTION)) {
      const name = this.previous().value as string;
      this.consume(TokenType.LPAREN, `Expected '(' after '${name}'`);
      const arg = this.expression();
      this.consume(TokenType.RPAREN, `Expected ')' after '${name}' argument`);
      return new FunctionCall(name, arg);
    }

    if (this.match(TokenType.LPAREN)) {
      const expr = this.expression();
      this.consume(TokenType.RPAREN, "Expected ')'");
      return expr;
    }

    if (this.match(TokenType.LBRACKET)) {
      return this.parseList();
    }

    throw new Error(
      `Expected expression but found '${this.peek().value ?? this.peek().type}'`,
    );
  }

  private parseList(): Node {
    const elements: Node[] = [];
    if (!this.check(TokenType.RBRACKET)) {
      elements.push(this.expression());
      while (this.match(TokenType.COMMA)) {
        elements.push(this.expression());
      }
    }
    this.consume(TokenType.RBRACKET, "Expected ']'");
    return new ListNode(elements);
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(message);
  }
}

function toNumber(val: number | boolean | number[]): number {
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (Array.isArray(val)) return val[0] ?? 0;
  return val;
}

function toBoolean(val: number | boolean | number[]): boolean {
  if (typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.length > 0;
  return val !== 0 && !Number.isNaN(val);
}

function evaluate(
  node: Node,
  vars: Record<string, number | boolean>,
): number | boolean | number[] {
  if (node instanceof NumberLiteral) {
    return node.value;
  }

  if (node instanceof VariableNode) {
    if (!(node.name in vars)) {
      throw new Error(`Undefined variable '${node.name}'`);
    }
    return vars[node.name];
  }

  if (node instanceof UnaryOp) {
    const val = evaluate(node.operand, vars);
    if (node.op === TokenType.MINUS) {
      return -toNumber(val);
    }
    if (node.op === TokenType.LOGICAL_NOT) {
      return !toBoolean(val);
    }
    throw new Error(`Unknown unary operator`);
  }

  if (node instanceof BinaryOp) {
    const left = evaluate(node.left, vars);
    const right = evaluate(node.right, vars);

    switch (node.op) {
      case TokenType.PLUS:
        return toNumber(left) + toNumber(right);
      case TokenType.MINUS:
        return toNumber(left) - toNumber(right);
      case TokenType.STAR:
        return toNumber(left) * toNumber(right);
      case TokenType.SLASH:
        return toNumber(left) / toNumber(right);
      case TokenType.MOD:
        return toNumber(left) % toNumber(right);
      case TokenType.CARET:
        return Math.pow(toNumber(left), toNumber(right));
      case TokenType.EQ:
        return left === right;
      case TokenType.NEQ:
        return left !== right;
      case TokenType.LT:
        return toNumber(left) < toNumber(right);
      case TokenType.GT:
        return toNumber(left) > toNumber(right);
      case TokenType.LTE:
        return toNumber(left) <= toNumber(right);
      case TokenType.GTE:
        return toNumber(left) >= toNumber(right);
      case TokenType.LOGICAL_OR:
        return toBoolean(left) || toBoolean(right);
      case TokenType.LOGICAL_AND:
        return toBoolean(left) && toBoolean(right);
      default:
        throw new Error(`Unknown binary operator`);
    }
  }

  if (node instanceof TernaryOp) {
    const condition = evaluate(node.condition, vars);
    if (toBoolean(condition)) {
      return evaluate(node.trueExpr, vars);
    }
    return evaluate(node.falseExpr, vars);
  }

  if (node instanceof FunctionCall) {
    const arg = toNumber(evaluate(node.argument, vars));
    switch (node.name) {
      case 'ceil':
        return Math.ceil(arg);
      case 'floor':
        return Math.floor(arg);
      case 'abs':
        return Math.abs(arg);
      case 'sqrt':
        return Math.sqrt(arg);
      default:
        throw new Error(`Unknown function '${node.name}'`);
    }
  }

  if (node instanceof ListNode) {
    return node.elements.map((el) => toNumber(evaluate(el, vars)));
  }

  throw new Error(`Unknown node type`);
}

const parseCache = new Map<string, Node>();

function parseExpression(input: string): Node {
  if (!parseCache.has(input)) {
    const trimmed = input.trim();
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    parseCache.set(input, ast);
  }
  return parseCache.get(input)!;
}

export function evaluateExpression(
  expr: string,
  vars: Record<string, number | boolean>,
): number | boolean | number[] {
  const ast = parseExpression(expr);
  return evaluate(ast, vars);
}

export function cleanFloat(value: number): number {
  if (!Number.isFinite(value)) return value;
  const cleaned = Math.round(value * 1e10) / 1e10;
  return cleaned;
}

export function formatAnswerValue(
  answer: number | boolean | number[],
): number | number[] | string {
  if (typeof answer === 'boolean') return answer ? 1 : 0;
  if (Array.isArray(answer)) return answer.map((v) => cleanFloat(v));
  if (!Number.isInteger(answer)) return cleanFloat(answer);
  return answer;
}

export function clearParseCache(): void {
  parseCache.clear();
}
