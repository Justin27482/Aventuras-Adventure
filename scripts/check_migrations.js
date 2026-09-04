import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(__dirname, '../src-tauri/migrations')

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const unknownOptions = args.filter((arg) => arg.startsWith('--') && arg !== '--check')
if (unknownOptions.length > 0) {
  console.error(`Unknown option(s): ${unknownOptions.join(', ')}`)
  process.exit(2)
}

const requestedFiles = args.filter((arg) => !arg.startsWith('--'))
const files =
  requestedFiles.length > 0
    ? requestedFiles
    : readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => resolve(migrationsDir, f))

let failed = false

for (const file of files) {
  let content = readFileSync(file, 'utf8')
  const normalized = content.replace(/\r\n?/g, '\n')
  if (normalized === content) continue

  if (checkOnly) {
    console.error(`Non-LF line endings detected: ${file}`)
    failed = true
    continue
  }

  writeFileSync(file, normalized, 'utf8')
  if (readFileSync(file, 'utf8').includes('\r')) {
    console.error(`Failed to normalize line endings: ${file}`)
    failed = true
  } else {
    console.log(`Normalized line endings: ${file}`)
    content = normalized
  }

  if (failed) continue
}

for (const file of files) {
  const version = Number(basename(file).match(/^(\d+)_/)?.[1] ?? 0)
  if (version < 67) continue

  const sql = readFileSync(file, 'utf8').replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '')
  const unsafeStatement = sql.match(
    /^\s*(?:ALTER\s+TABLE|DROP\s+|UPDATE\s+|DELETE\s+|INSERT\s+(?!OR\s+IGNORE))/im,
  )
  if (unsafeStatement) {
    console.error(
      `Migration ${version} is not retry-safe: ${unsafeStatement[0].trim()}. ` +
        'New migrations must be idempotent for lock-light startup recovery.',
    )
    failed = true
  }

  const nonIdempotentCreate = sql.match(
    /\bCREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER|VIEW)\s+(?!IF\s+NOT\s+EXISTS)/i,
  )
  if (nonIdempotentCreate) {
    console.error(
      `Migration ${version} has a non-idempotent CREATE statement. ` +
        'Use IF NOT EXISTS for migrations 67 and newer.',
    )
    failed = true
  }
}

if (failed) {
  process.exit(1)
}
