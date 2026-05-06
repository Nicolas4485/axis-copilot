// Google Slides API — extract text content from a presentation without export size limits

const SLIDES_API = 'https://slides.googleapis.com/v1'

interface TextRun {
  content?: string
}
interface TextElement {
  // Each element is either a paragraphMarker (no text) or a textRun (actual text).
  // The Slides API uses a flat list — textRun is directly on the element, not nested.
  textRun?: TextRun
  paragraphMarker?: unknown
}
interface ShapeText {
  textElements?: TextElement[]
}
interface Shape {
  text?: ShapeText
}
interface TableCell {
  text?: ShapeText
}
interface TableRow {
  tableCells?: TableCell[]
}
interface Table {
  tableRows?: TableRow[]
}
interface PageElement {
  shape?: Shape
  table?: Table
  elementGroup?: { children?: PageElement[] }
}
interface NotesSlide {
  pageElements?: PageElement[]
}
interface SlideProperties {
  notesSlide?: NotesSlide
}
interface Slide {
  pageElements?: PageElement[]
  slideProperties?: SlideProperties
}
interface Presentation {
  title?: string
  slides?: Slide[]
}

/** Extract plain text from a ShapeText block */
function extractShapeText(shapeText: ShapeText | undefined): string {
  if (!shapeText) return ''
  return (shapeText.textElements ?? [])
    .map((te) => te.textRun?.content ?? '')
    .join('')
    .trim()
}

/** Recursively extract text from a PageElement (handles shapes, tables, groups) */
function extractElementText(el: PageElement): string[] {
  const parts: string[] = []

  if (el.shape?.text) {
    const t = extractShapeText(el.shape.text)
    if (t) parts.push(t)
  }

  if (el.table) {
    for (const row of el.table.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) {
        const t = extractShapeText(cell.text)
        if (t) parts.push(t)
      }
    }
  }

  if (el.elementGroup?.children) {
    for (const child of el.elementGroup.children) {
      parts.push(...extractElementText(child))
    }
  }

  return parts
}

/**
 * Extract all text from a Google Slides presentation using the Slides API.
 * Covers shapes, tables, group elements, and speaker notes.
 * Returns slide-by-slide text with no export size limit.
 */
export async function getSlidesText(accessToken: string, presentationId: string): Promise<string> {
  const response = await fetch(`${SLIDES_API}/presentations/${presentationId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Slides API failed: ${response.status} ${await response.text()}`)
  }

  const presentation = await response.json() as Presentation
  const slides = presentation.slides ?? []
  const textParts: string[] = []

  let totalShapes = 0
  let totalTables = 0
  let totalGroups = 0

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]!
    const slideTexts: string[] = []

    for (const el of slide.pageElements ?? []) {
      if (el.shape) totalShapes++
      if (el.table) totalTables++
      if (el.elementGroup) totalGroups++
      slideTexts.push(...extractElementText(el))
    }

    // Extract speaker notes
    const notesElements = slide.slideProperties?.notesSlide?.pageElements ?? []
    const noteTexts: string[] = []
    for (const el of notesElements) {
      noteTexts.push(...extractElementText(el))
    }

    if (slideTexts.length > 0 || noteTexts.length > 0) {
      const parts = [`Slide ${i + 1}:`]
      if (slideTexts.length > 0) parts.push(slideTexts.join('\n'))
      if (noteTexts.length > 0) parts.push(`[Notes] ${noteTexts.join(' ')}`)
      textParts.push(parts.join('\n'))
    }
  }

  console.log(
    `[getSlidesText] ${slides.length} slides — shapes: ${totalShapes}, tables: ${totalTables}, groups: ${totalGroups}, extracted: ${textParts.length} slides with text`
  )

  return textParts.join('\n\n')
}
