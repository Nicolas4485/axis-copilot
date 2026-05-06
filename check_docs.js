process.env.DATABASE_URL = 'postgresql://axis:axis@localhost:5432/axis';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.knowledgeDocument.findMany({
  select: { filename: true, status: true, createdAt: true, deal: { select: { company: true } }, _count: { select: { chunks: true } } },
  orderBy: { createdAt: 'desc' }, take: 20
}).then(docs => {
  if (!docs.length) { console.log('NO DOCUMENTS FOUND IN DATABASE'); }
  else { docs.forEach(function(d) { console.log(d.filename + ' | ' + d.status + ' | deal:' + (d.deal && d.deal.company || 'none') + ' | ' + d._count.chunks + ' chunks'); }); }
}).catch(function(e) { console.log('DB ERROR:', e.message); });
