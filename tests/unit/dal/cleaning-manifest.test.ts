import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CleaningManifestDal } from '@/dal/cleaning-manifest.dal';

const DB_URL = process.env.DATABASE_URL || 'file:./test.db';

describe('CleaningManifestDal', () => {
  let prisma: PrismaClient;
  let dal: CleaningManifestDal;
  let companyId: string;
  let propertyId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();
    dal = new CleaningManifestDal(prisma);

    // Use the SECOND company to avoid concurrent test conflicts
    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[1]!.id;
    const property = await prisma.property.findFirst({ where: { companyId } });
    propertyId = property!.id;
  });

  afterAll(async () => {
    // Clean up manifests created by this test
    await prisma.cleaningManifest.deleteMany({ where: { companyId } });
    await prisma.$disconnect();
  });

  it('findByProperty returns null when no manifest exists', async () => {
    // Use a fake propertyId that won't have a manifest
    const result = await dal.findByProperty(companyId, 'nonexistent-prop-id');
    expect(result).toBeNull();
  });

  it('upsert creates a new manifest', async () => {
    const result = await dal.upsert({
      companyId,
      propertyId,
      checklist: { items: ['Strip beds', 'Mop floors'] },
      supplyLocations: { locations: ['{{CLOSET_A}}'] },
      accessInstructions: { instructions: 'Use code {{LOCKBOX_CODE}}' },
      emergencyContacts: {
        contacts: [{ name: '{{OWNER}}', role: 'owner', phonePlaceholder: '{{PHONE}}' }],
      },
    });

    expect(result.propertyId).toBe(propertyId);
    expect(result.companyId).toBe(companyId);

    const checklist = JSON.parse(result.checklistJson) as { items: string[] };
    expect(checklist.items).toHaveLength(2);
    expect(checklist.items[0]).toBe('Strip beds');
  });

  it('upsert updates an existing manifest', async () => {
    const updated = await dal.upsert({
      companyId,
      propertyId,
      checklist: { items: ['Strip beds', 'Mop floors', 'Wipe counters'] },
    });

    const checklist = JSON.parse(updated.checklistJson) as { items: string[] };
    expect(checklist.items).toHaveLength(3);
  });

  it('findByProperty returns the manifest after upsert', async () => {
    const result = await dal.findByProperty(companyId, propertyId);
    expect(result).not.toBeNull();
    expect(result!.propertyId).toBe(propertyId);
  });

  it('manifest does not contain plaintext access codes', async () => {
    // Re-upsert with access instructions to verify no plaintext codes
    await dal.upsert({
      companyId,
      propertyId,
      accessInstructions: { instructions: 'Use lockbox code {{LOCKBOX_CODE}} at front door.' },
    });

    const manifest = await dal.findByProperty(companyId, propertyId);
    expect(manifest).not.toBeNull();

    // Access instructions should only have placeholders
    const access = JSON.parse(manifest!.accessInstructionsJson) as { instructions: string };
    expect(access.instructions).toContain('{{LOCKBOX_CODE}}');
    // Should NOT contain anything that looks like a real code (4+ digit numbers)
    expect(access.instructions).not.toMatch(/\b\d{4,}\b/);
  });
});
