/** Shared formatting helpers used across pages. */

export const usd = (value: number | string) =>
  `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Build a quoted CSV string. Values are escaped per RFC 4180 (quotes doubled). */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const quote = (value: string | number | null | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
}

export function downloadTextFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
