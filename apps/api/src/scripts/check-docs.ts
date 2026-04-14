import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const docs = await p.knowledgeDocument.findMany({
  where: { clientId: 'cmnusxdd500011i3bf2o327gv' },
  include: { _count: { select: { chunks: true } } },
  orderBy: { createdAt: 'desc' },
})
docs.forEach((d) => console.log(`${d._count.chunks} chunks — ${(d.title ?? '').slice(0, 80)}`))
console.log(`\nTotal: ${docs.length} docs`)
await p.$disconnect()
