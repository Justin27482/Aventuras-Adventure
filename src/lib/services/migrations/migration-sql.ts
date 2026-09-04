export function splitMigrationSql(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let quote: "'" | '"' | '`' | null = null
  let inLineComment = false
  let inBlockComment = false
  let triggerStatement = false

  for (let index = 0; index < sql.length; index++) {
    const character = sql[index]
    const next = sql[index + 1]

    if (inLineComment) {
      current += character
      if (character === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      current += character
      if (character === '*' && next === '/') {
        current += next
        index++
        inBlockComment = false
      }
      continue
    }
    if (!quote && character === '-' && next === '-') {
      current += character + next
      index++
      inLineComment = true
      continue
    }
    if (!quote && character === '/' && next === '*') {
      current += character + next
      index++
      inBlockComment = true
      continue
    }
    if (quote) {
      current += character
      if (character === quote) {
        if (next === quote) {
          current += next
          index++
        } else {
          quote = null
        }
      }
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
      current += character
      continue
    }

    current += character
    if (!triggerStatement && /CREATE\s+TRIGGER\b/i.test(current)) triggerStatement = true
    if (character !== ';') continue

    if (triggerStatement && !/(?:^|\n)\s*END\s*;\s*$/i.test(current)) continue
    const statement = current.trim()
    if (statement) statements.push(statement)
    current = ''
    triggerStatement = false
  }

  const remainder = current.trim()
  if (remainder) statements.push(remainder)
  return statements
}
