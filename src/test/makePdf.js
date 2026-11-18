import { PDFDocument, StandardFonts } from 'pdf-lib'

/** pages: Array<Array<{ text, x, y, size }>> */
export async function makePdf(pages, { title } = {}) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  if (title) doc.setTitle(title)
  for (const items of pages) {
    const page = doc.addPage([600, 800])
    for (const { text, x, y, size } of items) page.drawText(text, { x, y, size, font })
  }
  const bytes = await doc.save()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}
