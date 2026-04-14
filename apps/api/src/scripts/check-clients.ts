import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const c = await p.client.findMany({ where: { name: 'Aura Commodities' }, include: { _count: { select: { knowledgeDocs: true } } } })
console.log(JSON.stringify(c, null, 2))
await p.$disconnect()
