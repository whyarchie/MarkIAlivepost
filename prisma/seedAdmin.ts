import prisma from '../src/config/prisma';
import bcrypt from 'bcrypt';

// Standalone bootstrap for the first admin — without the side effects of the
// full `db:seed` (which duplicates relational records on re-run). Idempotent:
// upserts on userId, so it is safe to run multiple times.
async function main() {
    const userId = 'super_admin';
    const password = await bcrypt.hash('Admin@123', 10);

    const admin = await prisma.admin.upsert({
        where: { userId },
        update: {},
        create: { name: 'Super Admin', userId, password },
        select: { id: true, name: true, userId: true },
    });

    console.log(`✅ Admin ready: ${admin.userId} (id=${admin.id}) — password: Admin@123`);
}

main()
    .catch((e) => {
        console.error('❌ Admin seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
