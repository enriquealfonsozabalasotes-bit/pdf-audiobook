// Export a chapter MP3: share sheet ("Salvar em Arquivos") first, download link as fallback.

const clean = (s) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()

export const chapterFilename = (bookTitle, index, chapterTitle) =>
  `${clean(bookTitle)} - ${String(index + 1).padStart(2, '0')} ${clean(chapterTitle)}.mp3`

export async function exportChapter({ blob, filename }) {
  const file = new File([blob], filename, { type: 'audio/mpeg' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.setAttribute('href', url)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
