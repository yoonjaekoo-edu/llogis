"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateExpression = evaluateExpression;
exports.cleanFloat = cleanFloat;
exports.formatAnswerValue = formatAnswerValue;
exports.clearParseCache = clearParseCache;
var TokenType;
(function (TokenType) {
    TokenType[TokenType["NUMBER"] = 0] = "NUMBER";
    TokenType[TokenType["VARIABLE"] = 1] = "VARIABLE";
    TokenType[TokenType["PLUS"] = 2] = "PLUS";
    TokenType[TokenType["MINUS"] = 3] = "MINUS";
    TokenType[TokenType["STAR"] = 4] = "STAR";
    TokenType[TokenType["SLASH"] = 5] = "SLASH";
    TokenType[TokenType["MOD"] = 6] = "MOD";
    TokenType[TokenType["CARET"] = 7] = "CARET";
    TokenType[TokenType["EQ"] = 8] = "EQ";
    TokenType[TokenType["NEQ"] = 9] = "NEQ";
    TokenType[TokenType["LT"] = 10] = "LT";
    TokenType[TokenType["GT"] = 11] = "GT";
    TokenType[TokenType["LTE"] = 12] = "LTE";
    TokenType[TokenType["GTE"] = 13] = "GTE";
    TokenType[TokenType["LOGICAL_OR"] = 14] = "LOGICAL_OR";
    TokenType[TokenType["LOGICAL_AND"] = 15] = "LOGICAL_AND";
    TokenType[TokenType["LOGICAL_NOT"] = 16] = "LOGICAL_NOT";
    TokenType[TokenType["QUESTION"] = 17] = "QUESTION";
    TokenType[TokenType["COLON"] = 18] = "COLON";
    TokenType[TokenType["LPAREN"] = 19] = "LPAREN";
    TokenType[TokenType["RPAREN"] = 20] = "RPAREN";
    TokenType[TokenType["LBRACKET"] = 21] = "LBRACKET";
    TokenType[TokenType["RBRACKET"] = 22] = "RBRACKET";
    TokenType[TokenType["COMMA"] = 23] = "COMMA";
    TokenType[TokenType["FUNCTION"] = 24] = "FUNCTION";
    TokenType[TokenType["EOF"] = 25] = "EOF";
})(TokenType || (TokenType = {}));
const FUNCTION_NAMES = new Set(['ceil', 'floor', 'abs', 'sqrt']);
const RESERVED_WORDS = new Map([
    ['true', true],
    ['false', false],
]);
function tokenize(input) {
    const tokens = [];
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
            }
            else if (RESERVED_WORDS.has(name)) {
                const val = RESERVED_WORDS.get(name);
                if (typeof val === 'boolean') {
                    tokens.push({ type: TokenType.NUMBER, value: val ? 1 : 0 });
                }
                else {
                    tokens.push({ type: TokenType.NUMBER, value: val });
                }
            }
            else {
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
class Node {
}
class NumberLiteral extends Node {
    value;
    constructor(value) {
        super();
        this.value = value;
    }
}
class VariableNode extends Node {
    name;
    constructor(name) {
        super();
        this.name = name;
    }
}
class BinaryOp extends Node {
    left;
    op;
    right;
    constructor(left, op, right) {
        super();
        this.left = left;
        this.op = op;
        this.right = right;
    }
}
class UnaryOp extends Node {
    op;
    operand;
    constructor(op, operand) {
        super();
        this.op = op;
        this.operand = operand;
    }
}
class TernaryOp extends Node {
    condition;
    trueExpr;
    falseExpr;
    constructor(condition, trueExpr, falseExpr) {
        super();
        this.condition = condition;
        this.trueExpr = trueExpr;
        this.falseExpr = falseExpr;
    }
}
class FunctionCall extends Node {
    name;
    argument;
    constructor(name, argument) {
        super();
        this.name = name;
        this.argument = argument;
    }
}
class ListNode extends Node {
    elements;
    constructor(elements) {
        super();
        this.elements = elements;
    }
}
class Parser {
    tokens;
    current = 0;
    constructor(tokens) {
        this.tokens = tokens;
    }
    parse() {
        const result = this.expression();
        if (!this.isAtEnd()) {
            const tok = this.peek();
            throw new Error(`Unexpected token '${tok.value ?? tok.type}' at position ${this.current}`);
        }
        return result;
    }
    expression() {
        return this.logicalOr();
    }
    logicalOr() {
        let expr = this.logicalAnd();
        while (this.match(TokenType.LOGICAL_OR)) {
            const right = this.logicalAnd();
            expr = new BinaryOp(expr, TokenType.LOGICAL_OR, right);
        }
        return expr;
    }
    logicalAnd() {
        let expr = this.ternary();
        while (this.match(TokenType.LOGICAL_AND)) {
            const right = this.ternary();
            expr = new BinaryOp(expr, TokenType.LOGICAL_AND, right);
        }
        return expr;
    }
    ternary() {
        let expr = this.comparison();
        if (this.match(TokenType.QUESTION)) {
            const trueExpr = this.expression();
            this.consume(TokenType.COLON, "Expected ':' for ternary operator");
            const falseExpr = this.ternary();
            expr = new TernaryOp(expr, trueExpr, falseExpr);
        }
        return expr;
    }
    comparison() {
        let expr = this.addition();
        while (this.match(TokenType.EQ, TokenType.NEQ, TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE)) {
            const op = this.previous().type;
            const right = this.addition();
            expr = new BinaryOp(expr, op, right);
        }
        return expr;
    }
    addition() {
        let expr = this.multiplication();
        while (this.match(TokenType.PLUS, TokenType.MINUS)) {
            const op = this.previous().type;
            const right = this.multiplication();
            expr = new BinaryOp(expr, op, right);
        }
        return expr;
    }
    multiplication() {
        let expr = this.unary();
        while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.MOD)) {
            const op = this.previous().type;
            const right = this.unary();
            expr = new BinaryOp(expr, op, right);
        }
        return expr;
    }
    unary() {
        if (this.match(TokenType.MINUS, TokenType.LOGICAL_NOT)) {
            const op = this.previous().type;
            const operand = this.unary();
            return new UnaryOp(op, operand);
        }
        return this.exponent();
    }
    exponent() {
        let expr = this.primary();
        if (this.match(TokenType.CARET)) {
            const right = this.exponent();
            expr = new BinaryOp(expr, TokenType.CARET, right);
        }
        return expr;
    }
    primary() {
        if (this.match(TokenType.NUMBER)) {
            return new NumberLiteral(this.previous().value);
        }
        if (this.match(TokenType.VARIABLE)) {
            return new VariableNode(this.previous().value);
        }
        if (this.match(TokenType.FUNCTION)) {
            const name = this.previous().value;
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
        throw new Error(`Expected expression but found '${this.peek().value ?? this.peek().type}'`);
    }
    parseList() {
        const elements = [];
        if (!this.check(TokenType.RBRACKET)) {
            elements.push(this.expression());
            while (this.match(TokenType.COMMA)) {
                elements.push(this.expression());
            }
        }
        this.consume(TokenType.RBRACKET, "Expected ']'");
        return new ListNode(elements);
    }
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }
    check(type) {
        if (this.isAtEnd())
            return false;
        return this.peek().type === type;
    }
    advance() {
        if (!this.isAtEnd())
            this.current++;
        return this.previous();
    }
    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }
    peek() {
        return this.tokens[this.current];
    }
    previous() {
        return this.tokens[this.current - 1];
    }
    consume(type, message) {
        if (this.check(type))
            return this.advance();
        throw new Error(message);
    }
}
function toNumber(val) {
    if (typeof val === 'boolean')
        return val ? 1 : 0;
    if (Array.isArray(val))
        return val[0] ?? 0;
    return val;
}
function toBoolean(val) {
    if (typeof val === 'boolean')
        return val;
    if (Array.isArray(val))
        return val.length > 0;
    return val !== 0 && !Number.isNaN(val);
}
function evaluate(node, vars) {
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
const parseCache = new Map();
function parseExpression(input) {
    if (!parseCache.has(input)) {
        const trimmed = input.trim();
        const tokens = tokenize(trimmed);
        const parser = new Parser(tokens);
        const ast = parser.parse();
        parseCache.set(input, ast);
    }
    return parseCache.get(input);
}
function evaluateExpression(expr, vars) {
    const ast = parseExpression(expr);
    return evaluate(ast, vars);
}
function cleanFloat(value) {
    if (!Number.isFinite(value))
        return value;
    const cleaned = Math.round(value * 1e10) / 1e10;
    return cleaned;
}
function formatAnswerValue(answer) {
    if (typeof answer === 'boolean')
        return answer ? 1 : 0;
    if (Array.isArray(answer))
        return answer.map((v) => cleanFloat(v));
    if (!Number.isInteger(answer))
        return cleanFloat(answer);
    return answer;
}
function clearParseCache() {
    parseCache.clear();
}
