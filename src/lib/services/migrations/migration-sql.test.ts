import { describe, expect, it } from 'vitest'
import { splitMigrationSql } from './migration-sql'

describe('splitMigrationSql', () => {
  it('splits retry-safe schema statements in order', () => {
    const statements = splitMigrationSql(`
      CREATE TABLE IF NOT EXISTS example (id TEXT PRIMARY KEY);
      CREATE INDEX IF NOT EXISTS idx_example ON example(id);
    `)

    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain('CREATE TABLE')
    expect(statements[1]).toContain('CREATE INDEX')
  })

  it('keeps a trigger body together despite internal semicolons', () => {
    const statements = splitMigrationSql(`
      CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY);
      CREATE TRIGGER IF NOT EXISTS immutable_revision
      BEFORE UPDATE ON revisions
      BEGIN
        SELECT RAISE(ABORT, 'revisions are immutable');
      END;
    `)

    expect(statements).toHaveLength(2)
    expect(statements[1]).toContain("RAISE(ABORT, 'revisions are immutable');")
    expect(statements[1]).toMatch(/END;$/)
  })

  it('does not split on semicolons inside quoted text or comments', () => {
    const statements = splitMigrationSql(`
      -- This comment contains a semicolon;
      CREATE TABLE IF NOT EXISTS notes (value TEXT DEFAULT 'a;b');
      /* This block also contains a semicolon; */
      CREATE INDEX IF NOT EXISTS idx_notes ON notes(value);
    `)

    expect(statements).toHaveLength(2)
  })
})
