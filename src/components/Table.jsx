export const Table = ({ columns, rows, emptyLabel = 'Sem registros.' }) => (
  <div className="table">
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="table-empty">
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td key={`${row.id}-${col.key}`}>{row[col.key]}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);
