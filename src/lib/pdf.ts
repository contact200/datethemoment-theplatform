export type ImportedEvent = {
  kind: 'match' | 'training'
  team: string
  opponent: string
  venue: string
  event_date: string
  start_time: string
}

export async function pdfToText(file: File): Promise<string> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Select a PDF document.')
  if (file.size > 10 * 1024 * 1024) throw new Error('PDF must be 10 MB or smaller.')
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data: bytes })
  const doc = await loadingTask.promise
  const pages: string[] = []
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 25); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      // Group PDF text runs by their vertical position to preserve schedule rows.
      // PDF text extraction is heuristic, and users still need to review each event.
      const lines: { y: number; parts: { x: number; text: string }[] }[] = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const t = 'transform' in item ? item.transform : []
        const x = t?.[4] ?? 0
        const y = t?.[5] ?? 0
        let line = lines.find(l => Math.abs(l.y - y) <= 2.5)
        if (!line) { line = { y, parts: [] }; lines.push(line) }
        line.parts.push({ x, text: item.str.trim() })
      }
      lines.sort((a, b) => b.y - a.y)
      pages.push(lines.map(line => line.parts.sort((a,b) => a.x - b.x).map(p => p.text).join(' ')).join('\n'))
    }
  } finally { await loadingTask.destroy() }
  return pages.join('\n')
}

// Conservative, per-line date parsing. It doesn't invent missing event fields.
// Text-based PDF only. The customer MUST review/edit all imported entries.
export function parseScheduleText(text: string): ImportedEvent[] {
  const lines = text.split(/\r?\n|\s{3,}/).map(s => s.trim()).filter(Boolean)
  const parsed: ImportedEvent[] = []
  const numericRe = /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b|\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/
  const namedRe = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  for (const line of lines) {
    const date = line.match(numericRe)
    const named = date ? null : line.match(namedRe)
    if (!date && !named) continue
    let iso = ''
    if (date?.[1]) iso = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`
    else if (date) iso = `${date[6]}-${date[4].padStart(2, '0')}-${date[5].padStart(2, '0')}`
    else if (named) {
      const month = months.indexOf(named[1].slice(0, 3).toLowerCase()) + 1
      iso = `${named[3]}-${String(month).padStart(2, '0')}-${named[2].padStart(2, '0')}`
    }
    const dt = new Date(`${iso}T12:00:00`)
    if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) continue

    const timeMatch = line.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b|\b(\d{1,2})\s*(AM|PM)\b/i)
    let start_time = ''
    if (timeMatch) {
      let hour = Number(timeMatch[1] || timeMatch[4])
      const minutes = timeMatch[2] || '00'
      const meridiem = (timeMatch[3] || timeMatch[5] || '').toUpperCase()
      if (hour > 23 || Number(minutes) > 59 || (meridiem && (hour < 1 || hour > 12))) continue
      if (meridiem) hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0)
      start_time = `${String(hour).padStart(2, '0')}:${minutes}`
    }
    const vs = line.match(/\b(?:vs\.?|versus|v\.)\s+(.+?)(?:\s+[|@-]\s+|$)/i)
    const kind: ImportedEvent['kind'] = /\b(practice|training)\b/i.test(line) ? 'training' : 'match'
    parsed.push({ kind, team: '', opponent: vs ? vs[1].trim().slice(0, 100) : '', venue: '', event_date: iso, start_time })
    if (parsed.length >= 50) break
  }
  return parsed
}
