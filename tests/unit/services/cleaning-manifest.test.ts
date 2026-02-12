import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getCleaningManifest } from '@/services/cleaning-manifest.service';

const DB_URL = process.env.DATABASE_URL || 'file:./test.db';

describe('cleaning-manifest.service', () => {
  let prisma: PrismaClient;
  let companyId: string;
  let propertyId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();

    // Use the SECOND company to avoid concurrent test conflicts
    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[1]!.id;
    const property = await prisma.property.findFirst({ where: { companyId } });
    propertyId = property!.id;
  });

  afterAll(async () => {
    await prisma.cleaningManifest.deleteMany({ where: { companyId } });
    await prisma.$disconnect();
  });

  it('returns a default manifest when none exists', async () => {
    // Delete any existing manifest for this property
    await prisma.cleaningManifest.deleteMany({ where: { propertyId } });

    const manifest = await getCleaningManifest(companyId, propertyId);

    expect(manifest.propertyId).toBe(propertyId);
    expect(manifest.checklist.items.length).toBeGreaterThan(0);
    expect(manifest.supplyLocations.locations.length).toBeGreaterThan(0);
    expect(manifest.accessInstructions.instructions).toContain('{{LOCKBOX_CODE}}');
    expect(manifest.emergencyContacts.contacts.length).toBeGreaterThan(0);
  });

  it('returns a stored manifest when one exists', async () => {
    // Create a manifest
    await prisma.cleaningManifest.upsert({
      where: { propertyId },
      create: {
        companyId,
        propertyId,
        checklistJson: JSON.stringify({ items: ['Custom item'] }),
        supplyLocationsJson: JSON.stringify({ locations: ['{{GARAGE}}'] }),
        accessInstructionsJson: JSON.stringify({ instructions: 'Ring bell' }),
        emergencyContactsJson: JSON.stringify({ contacts: [] }),
      },
      update: {
        checklistJson: JSON.stringify({ items: ['Custom item'] }),
        supplyLocationsJson: JSON.stringify({ locations: ['{{GARAGE}}'] }),
        accessInstructionsJson: JSON.stringify({ instructions: 'Ring bell' }),
        emergencyContactsJson: JSON.stringify({ contacts: [] }),
      },
    });

    const manifest = await getCleaningManifest(companyId, propertyId);

    expect(manifest.checklist.items).toEqual(['Custom item']);
    expect(manifest.supplyLocations.locations).toEqual(['{{GARAGE}}']);
    expect(manifest.accessInstructions.instructions).toBe('Ring bell');
  });

  it('never exposes plaintext codes in default manifest', async () => {
    await prisma.cleaningManifest.deleteMany({ where: { propertyId } });
    const manifest = await getCleaningManifest(companyId, propertyId);

    // All sensitive fields should be placeholders ({{...}})
    const allText = JSON.stringify(manifest);
    const placeholders = allText.match(/\{\{[A-Z_]+\}\}/g) || [];
    expect(placeholders.length).toBeGreaterThan(0);

    // Strip out fields that legitimately contain IDs/timestamps, then check
    // that no plaintext door codes (purely numeric, 4-6 digits) remain.
    const sensitiveFields = JSON.stringify({
      checklist: manifest.checklist,
      supplyLocations: manifest.supplyLocations,
      accessInstructions: manifest.accessInstructions,
      emergencyContacts: manifest.emergencyContacts,
    });
    // A real door code would be a standalone 4-6 digit number like "1234"
    expect(sensitiveFields).not.toMatch(/(?<![a-f0-9-])\b\d{4,6}\b(?![a-f0-9-])/);
  });
});
