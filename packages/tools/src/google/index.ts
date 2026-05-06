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
  downloadFileAuto,
  getEffectiveMimeType,
  watchFile,
  stopWatch,
} from './drive.js'
export type { DriveFile, DriveListResult } from './drive.js'

export { getSlidesText } from './slides.js'

export { createDocument, appendSection, appendText } from './docs.js'
export type { CreatedDoc } from './docs.js'

export { createSpreadsheet, writeRange, formatSheet } from './sheets.js'
export type { CreatedSheet } from './sheets.js'

export { sendEmail, createDraft, searchMessages, readMessage } from './gmail.js'
export type { EmailResult, GmailMessage } from './gmail.js'
