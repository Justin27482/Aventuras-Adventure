/**
 * Safe evaluator for ruleset resource formulas (e.g. "10 + constitution + level * 5").
 * Supports +, -, *, /, parentheses, unary minus, numeric literals, and identifiers
 * resolved from a context map (stat keys plus `level`). No `eval()`/`Function()` —
 * this only ever executes a small whitelisted grammar.
 */

type TokenType = 'number' | 'identifier' | 'op' | 'lparen' | 'rparen' | 'eof'
interface Token {
  type: TokenType
  value: string
}

const TOKEN_RE = /\s*(?:(\d+(?:\.\d+)?)|([a-zA-Z_][a-zA-Z0-9_]*)|([+\-*/])|(\()|(\)))/y

function tokenize(formula: string): Token[] {
  const tokens: Token[] = []
  TOKEN_RE.lastIndex = 0
  let lastIndex = 0
  let match: RegExpExecArray | null

  while (TOKEN_RE.lastIndex < formula.length) {
    match = TOKEN_RE.exec(formula)
    if (!match) {
      // Only trailing whitespace remains after the last real token — done.
      if (/^\s*$/.test(formula.slice(lastIndex))) break
      throw new Error(`Invalid character in resource formula near: "${formula.slice(lastIndex)}"`)
    }
    if (match.index !== lastIndex) {
      throw new Error(`Invalid character in resource formula near: "${formula.slice(lastIndex)}"`)
    }
    const [, number, identifier, op, lparen, rparen] = match
    if (number !== undefined) tokens.push({ type: 'number', value: number })
    else if (identifier !== undefined) tokens.push({ type: 'identifier', value: identifier })
    else if (op !== undefined) tokens.push({ type: 'op', value: op })
    else if (lparen !== undefined) tokens.push({ type: 'lparen', value: '(' })
    else if (rparen !== undefined) tokens.push({ type: 'rparen', value: ')' })
    lastIndex = TOKEN_RE.lastIndex
  }
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

class FormulaParser {
  private pos = 0
  constructor(
    private tokens: Token[],
    private context: Record<string, number>,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private consume(): Token {
    return this.tokens[this.pos++]
  }

  parse(): number {
    const value = this.parseExpression()
    if (this.peek().type !== 'eof') {
      throw new Error(`Unexpected token in resource formula: "${this.peek().value}"`)
    }
    return value
  }

  private parseExpression(): number {
    let value = this.parseTerm()
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value
      const rhs = this.parseTerm()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  private parseTerm(): number {
    let value = this.parseUnary()
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value
      const rhs = this.parseUnary()
      value = op === '*' ? value * rhs : value / rhs
    }
    return value
  }

  private parseUnary(): number {
    if (this.peek().type === 'op' && this.peek().value === '-') {
      this.consume()
      return -this.parseUnary()
    }
    return this.parseFactor()
  }

  private parseFactor(): number {
    const token = this.peek()
    if (token.type === 'number') {
      this.consume()
      return Number(token.value)
    }
    if (token.type === 'identifier') {
      this.consume()
      const value = this.context[token.value]
      if (value === undefined) {
        throw new Error(`Unknown identifier in resource formula: "${token.value}"`)
      }
      return value
    }
    if (token.type === 'lparen') {
      this.consume()
      const value = this.parseExpression()
      if (this.peek().type !== 'rparen') {
        throw new Error('Mismatched parentheses in resource formula')
      }
      this.consume()
      return value
    }
    throw new Error(`Unexpected token in resource formula: "${token.value}"`)
  }
}

/**
 * Evaluates a resource formula against a context of stat values plus `level`.
 * @throws if the formula references an identifier missing from `context`.
 */
export function evaluateFormula(formula: string, context: Record<string, number>): number {
  const tokens = tokenize(formula)
  return new FormulaParser(tokens, context).parse()
}
