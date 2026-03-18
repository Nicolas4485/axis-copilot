// Google Sheets — create spreadsheets with formatting

const SHEETS_API = 'https://sheets.googleapis.com/v4'

/** Created spreadsheet info */
export interface CreatedSheet {
  spreadsheetId: string
  spreadsheetUrl: string
  title: string
}

/**
 * Create a new Google Spreadsheet.
 */
export async function createSpreadsheet(
  accessToken: string,
  title: string,
  sheetNames: string[] = ['Sheet1']
): Promise<CreatedSheet> {
  const response = await fetch(`${SHEETS_API}/spreadsheets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: sheetNames.map((name) => ({
        properties: { title: name },
      })),
    }),
  })

  if (!response.ok) {
    throw new Error(`Sheets create failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as {
    spreadsheetId: string
    spreadsheetUrl: string
    properties: { title: string }
  }

  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    title: data.properties.title,
  }
}

/**
 * Write data to a sheet range.
 */
export async function writeRange(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<{ updatedCells: number }> {
  const response = await fetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ range, values }),
    }
  )

  if (!response.ok) {
    throw new Error(`Sheets write failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as { updatedCells: number }
  return { updatedCells: data.updatedCells }
}

/**
 * Apply formatting to a sheet (header row bold, column widths, etc.).
 */
export async function formatSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  options: {
    headerBold?: boolean
    freezeRows?: number
    columnWidths?: Array<{ column: number; width: number }>
  }
): Promise<void> {
  const requests: Array<Record<string, unknown>> = []

  if (options.headerBold) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    })
  }

  if (options.freezeRows) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: options.freezeRows },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    })
  }

  if (options.columnWidths) {
    for (const col of options.columnWidths) {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: col.column,
            endIndex: col.column + 1,
          },
          properties: { pixelSize: col.width },
          fields: 'pixelSize',
        },
      })
    }
  }

  if (requests.length === 0) return

  const response = await fetch(`${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })

  if (!response.ok) {
    throw new Error(`Sheets format failed: ${response.status} ${await response.text()}`)
  }
}
