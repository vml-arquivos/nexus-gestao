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

/**
 * Tabela simples responsiva. Para tabelas complexas use uma biblioteca adequada.
 */
export default function Table<T extends { [key: string]: any }>({ columns, data, keyField, className }: TableProps<T>) {
  return (
    <div style={{ overflowX: 'auto' }} className={className}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border2)',
                  fontSize: 12,
                  color: 'var(--text2)',
                  fontWeight: 600,
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
                const value =
                  typeof col.accessor === 'function'
                    ? col.accessor(row)
                    : (row[col.accessor] as React.ReactNode)
                return (
                  <td
                    key={colIndex}
                    style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' }}
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
              <td colSpan={columns.length} style={{ padding: '16px', textAlign: 'center', color: 'var(--text3)' }}>
                Nenhum registro encontrado
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}