// Run once after `next dev` says "Ready" to seed prerender-manifest.js.
// Node.js 24 + Next.js 14 Windows: the atomic rename fails so Next.js can't
// write this file itself. The middleware sandbox needs it to exist on first request.
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '../../.next')
mkdirSync(root, { recursive: true })

const manifest = JSON.stringify({
  version: 3,
  routes: {},
  dynamicRoutes: {},
  notFoundRoutes: [],
  preview: {
    previewModeId: 'development',
    previewModeSigningKey: 'development',
    previewModeEncryptionKey: 'development',
  },
})

writeFileSync(join(root, 'prerender-manifest.js'), `self.__PRERENDER_MANIFEST = ${JSON.stringify(manifest)}`)
writeFileSync(join(root, 'prerender-manifest.json'), manifest)

console.log('[seed] prerender-manifest.js written')
