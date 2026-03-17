import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('Seeding database...')

  const user = await prisma.user.upsert({
    where: { email: 'nick@axis.ai' },
    update: {},
    create: {
      email: 'nick@axis.ai',
      name: 'Nick',
      role: UserRole.ADMIN,
    },
  })
  console.log(`  User: ${user.email} (${user.id})`)

  const client = await prisma.client.upsert({
    where: { id: 'seed-acme-corp' },
    update: {},
    create: {
      id: 'seed-acme-corp',
      userId: user.id,
      name: 'Acme Corp',
      industry: 'PropTech',
      companySize: 200,
      notes: 'Demo client for development and testing.',
      techStack: ['React', 'Node.js', 'PostgreSQL'],
    },
  })
  console.log(`  Client: ${client.name} (${client.id})`)

  console.log('Seed complete.')
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
