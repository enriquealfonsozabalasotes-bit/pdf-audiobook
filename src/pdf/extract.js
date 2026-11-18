// pdf.js adapter: PDF bytes -> positioned text items per page + top-level outline.

export class PdfError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PdfError'
    this.code = code // 'NO_TEXT' | 'ENCRYPTED' | 'INVALID'
  }
}

let libPromise
function loadPdfjs() {
  if (!libPromise) {
    libPromise =
      import.meta.env?.MODE === 'test'
        ? import('pdfjs-dist/legacy/build/pdf.mjs')
        : Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
            ([lib, worker]) => {
              lib.GlobalWorkerOptions.workerSrc = worker.default
              return lib
            },
          )
  }
  return libPromise
}

async function destToPageIndex(doc, dest) {
  const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
  if (!Array.isArray(explicit) || explicit[0] == null) return -1
  const target = explicit[0]
  if (typeof target === 'number') return target
  const index = await doc.getPageIndex(target)
  return Number.isInteger(index) ? index : -1
}

export async function resolveOutline(doc) {
  const outline = (await doc.getOutline()) || []
  const result = []
  for (const entry of outline) {
    if (!entry.dest) continue
    try {
      const pageIndex = await destToPageIndex(doc, entry.dest)
      if (pageIndex >= 0) result.push({ title: (entry.title || '').trim() || 'Sem título', pageIndex })
    } catch {
      // unresolvable destination: skip
    }
  }
  return result
}

function mapOpenError(err) {
  if (err?.name === 'PasswordException') return new PdfError('ENCRYPTED', 'Este PDF é protegido por senha.')
  return new PdfError('INVALID', 'Não foi possível abrir este arquivo como PDF.')
}

export async function extractPdf(data, { lib } = {}) {
  const pdfjs = lib || (await loadPdfjs())
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false, disableFontFace: true, verbosity: 0 })
      .promise
  } catch (err) {
    throw mapOpenError(err)
  }
  try {
    const pages = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const [, , width, height] = page.view
      const content = await page.getTextContent()
      const items = content.items
        .filter((it) => typeof it.str === 'string' && it.str.trim())
        .map((it) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width,
          fontSize: Math.hypot(it.transform[2], it.transform[3]),
        }))
      pages.push({ pageIndex: i - 1, width, height, items })
      page.cleanup()
    }
    if (!pages.some((p) => p.items.length)) {
      throw new PdfError('NO_TEXT', 'Este PDF não tem texto selecionável.')
    }
    const meta = await doc.getMetadata().catch(() => null)
    const title = meta?.info?.Title?.trim() || null
    const outline = await resolveOutline(doc)
    return { title, pages, outline }
  } finally {
    doc.destroy()
  }
}
