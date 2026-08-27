import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('exclusão segura de tarefas', () => {
  it('usa um único PoolClient e protege checklists grandes', () => {
    const source = read('src/routes/tarefas.ts')
    const start = source.indexOf('router.delete("/:id"')
    const end = source.indexOf('// ── PEDIR AJUDA', start)
    const block = source.slice(start, end)

    expect(block).toContain('pg_column_size(checklist)')
    expect(block).toContain('checklist_protegido: true')
    expect(block).toContain('client = await pool.connect()')
    expect(block).toContain('await client.query("BEGIN")')
    expect(block).toContain('await client.query("COMMIT")')
    expect(block).toContain('await client.query("ROLLBACK")')
    expect(block).toContain('client?.release()')
    expect(block).not.toMatch(/await query\(["']BEGIN["']/)
    expect(block).not.toMatch(/await query\(["']COMMIT["']/)
    expect(block).not.toMatch(/await query\(["']ROLLBACK["']/)
  })
})
