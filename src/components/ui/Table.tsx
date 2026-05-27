import React from 'react'

interface Column<T> {
  header: string
  accessor: keyof T | ((row: T) => React.ReactNode)
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField?: keyof T
  className?: string
}

/** Tabela simples com wrapper responsivo e scroll discreto no mobile. */
export default function Table<T extends { [key: string]: any }>({ columns, data, keyField, className }: TableProps<T>) {
  return (
    <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className={`table-responsive ${className || ''}`.trim()}>
      <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border2)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text2)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
                className={col.className}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={(keyField ? row[keyField] : rowIndex) as any}>
              {columns.map((col, colIndex) => {
                const value = typeof col.accessor === 'function' ? col.accessor(row) : (row[col.accessor] as React.ReactNode)
                return (
                  <td
                    key={colIndex}
                    style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', color: 'var(--text)', overflowWrap: 'anywhere' }}
                    className={col.className}
                  >
                    {value}
                  </td>
                )
              })}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{ padding: 18, textAlign: 'center', color: 'var(--text3)' }}>
                Nenhum registro encontrado
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
