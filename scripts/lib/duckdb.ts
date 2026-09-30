import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..')

function resolveBinary(): string {
  if (process.env.DUCKDB_PATH) return process.env.DUCKDB_PATH
  const local = path.join(ROOT, 'tools', process.platform === 'win32' ? 'duckdb.exe' : 'duckdb')
  if (existsSync(local)) return local
  return 'duckdb' // assume it's on PATH (e.g. installed by CI)
}

/** Runs a DuckDB SQL script (one or more `;`-separated statements) via the CLI. */
export function runDuckDbSql(sql: string): void {
  const bin = resolveBinary()
  const result = spawnSync(bin, ['-c', sql], { cwd: ROOT, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 64 })
  if (result.error) {
    throw new Error(
      `Could not run DuckDB CLI at "${bin}". Set DUCKDB_PATH or place the binary at tools/duckdb(.exe). Original error: ${result.error.message}`,
    )
  }
  if (result.status !== 0) {
    throw new Error(`DuckDB exited with code ${result.status}:\n${result.stderr}`)
  }
}
