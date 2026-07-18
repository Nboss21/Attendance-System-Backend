import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(value, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function main() {
  const superAdminPassword = await hashPassword('superadmin123');

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@bayn.com' },
    update: {},
    create: {
      email: 'superadmin@bayn.com',
      passwordHash: superAdminPassword,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log(`Created Super Admin: ${superAdmin.email} (ID: ${superAdmin.id})`);

  const companies = [
    { name: 'Tikurabay Shoe Factory', code: 'TIKURABAY', adminEmail: 'admin@tikurabay.com' },
    { name: 'Black Nile Shoe Factory', code: 'BLACKNILE', adminEmail: 'admin@blacknile.com' },
    { name: 'ELICO Universal Tannery', code: 'ELICO', adminEmail: 'admin@elico.com' },
    { name: 'Awash TanneryAddis Tannery', code: 'AWASHADDIS', adminEmail: 'admin@awashaddis.com' },
  ];

  const defaultPassword = 'admin123';
  const passwordHash = await hashPassword(defaultPassword);

  for (const companyData of companies) {
    const company = await prisma.company.upsert({
      where: { code: companyData.code },
      update: {},
      create: {
        name: companyData.name,
        code: companyData.code,
        plan: 'starter',
        status: 'ACTIVE',
      },
    });

    await prisma.user.upsert({
      where: { email: companyData.adminEmail },
      update: {},
      create: {
        companyId: company.id,
        email: companyData.adminEmail,
        passwordHash,
        role: 'COMPANY_ADMIN',
        status: 'ACTIVE',
      },
    });

    console.log(`Created Company: ${company.name} (Code: ${company.code}, Admin: ${companyData.adminEmail})`);
  }

  console.log('\nSeeding complete!');
  console.log('Default admin password for all companies: admin123');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });