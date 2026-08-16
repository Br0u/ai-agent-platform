import { open, unlink } from "node:fs/promises";
import path from "node:path";

const [output] = process.argv.slice(2);
if (
  process.argv.length !== 3 ||
  !output ||
  (!path.isAbsolute(output) && path.basename(output) === output) ||
  path.extname(output).toLowerCase() !== ".pdf"
) {
  throw new Error("Provide one explicit new .pdf output path");
}

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "<< /Length 45 >>\nstream\nBT /F1 24 Tf 72 720 Td (Download test) Tj ET\nendstream",
];

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const [index, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf, "ascii"));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf, "ascii");
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets
  .slice(1)
  .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
  .join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

const handle = await open(output, "wx", 0o640);
try {
  await handle.writeFile(pdf, "ascii");
} catch (error) {
  await handle.close().catch(() => undefined);
  await unlink(output).catch(() => undefined);
  throw error;
}
await handle.close();
