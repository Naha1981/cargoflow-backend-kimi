interface LiveTableProps {
  headers: string[];
  rows: any[];
  keyExtractor: (row: any) => string;
  renderRow: (row: any) => React.ReactNode;
  emptyText?: string;
}

export function LiveTable({ headers, rows, keyExtractor, renderRow, emptyText = "No data." }: LiveTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={keyExtractor(row)} className="hover:bg-muted/30 transition-colors">
              {renderRow(row)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-4 text-muted-foreground text-center">{emptyText}</p>}
    </div>
  );
}
