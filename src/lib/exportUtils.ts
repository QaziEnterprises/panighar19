import * as XLSX from "xlsx";

export function exportToExcel(data: Record<string, any>[], filename: string, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function importFromExcel<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(buf);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<T>(ws);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function printAsPDF(title: string, headers: string[], rows: string[][]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const headerRow = headers.map(h => `<th>${h}</th>`).join("");
  const bodyRows = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("");

  printWindow.document.write(`
    <html><head><title>${title}</title>
    <style>
      body { font-family: sans-serif; padding: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 13px; }
      th { background: #f5f5f5; text-align: center; }
      td:first-child, th:first-child { text-align: left; }
      h1 { font-size: 20px; }
      .meta { color: #666; font-size: 13px; margin-bottom: 8px; }
    </style></head>
    <body>
      <h1>${title} - Qazi Enterprises</h1>
      <p class="meta">Generated: ${new Date().toLocaleDateString()}</p>
      <table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
    </body></html>
  `);
  printWindow.document.close();
  printWindow.print();
  return true;
}
