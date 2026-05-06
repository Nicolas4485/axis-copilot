import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const docs = await prisma.document.findMany({
  select: { id: true, title: true, clientId: true, userId: true }
})
console.log(JSON.stringify(docs, null, 2))
// patch: assign any null userId to our user
const MY_USER = 'cmnwam5yz0000j15vowakb8pu'
const nullDocs = docs.filter(d => !d.userId)
if (nullDocs.length > 0) {
  const updated = await prisma.document.updateMany({
    where: { userId: null },
    data: { userId: MY_USER }
  })
  console.log(`Patched ${updated.count} documents → userId set to ${MY_USER}`)
}
await prisma.$disconnect()
