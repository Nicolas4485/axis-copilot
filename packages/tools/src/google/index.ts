// Google Workspace integration — @axis/tools/google

export {
  getAuthUrl,
  exchangeCode,
  refreshAccessToken,
  encryptTokens,
  decryptTokens,
  getValidToken,
} from './auth.js'
export type { GoogleTokens, EncryptedTokens } from './auth.js'

export {
  listFiles,
  getFileMetadata,
  downloadFile,
  watchFile,
  stopWatch,
} from './drive.js'
export type { DriveFile, DriveListResult } from './drive.js'

export { createDocument, appendSection, appendText } from './docs.js'
export type { CreatedDoc } from './docs.js'

export { createSpreadsheet, writeRange, formatSheet } from './sheets.js'
export type { CreatedSheet } from './sheets.js'

export { sendEmail, createDraft } from './gmail.js'
export type { EmailResult } from './gmail.js'
