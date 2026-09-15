import type { CellValue, Workbook } from "exceljs";

export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value) return String(value.text).trim();
    if ("result" in value) return cellText(value.result as CellValue);
    return "";
  }
  return String(value).trim();
}

export async function workbookResponse(workbook: Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}

/** Başlık satırını kalın ve dolgulu yapar, sütun genişliklerini ayarlar. */
export function styleHeader(sheet: import("exceljs").Worksheet, widths: number[]) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}
