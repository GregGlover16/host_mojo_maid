import { PrismaClient } from '@prisma/client';

export interface ManifestChecklist {
  items: string[];
}

export interface ManifestSupplyLocations {
  locations: string[];
}

export interface ManifestAccessInstructions {
  /** Must NEVER contain actual codes — use placeholders like "{{LOCKBOX_CODE}}" */
  instructions: string;
}

export interface ManifestEmergencyContact {
  name: string;
  role: string;
  /** Placeholder, e.g. "{{OWNER_PHONE}}" — resolved at runtime via secret store */
  phonePlaceholder: string;
}

export interface ManifestEmergencyContacts {
  contacts: ManifestEmergencyContact[];
}

export interface UpsertManifestInput {
  companyId: string;
  propertyId: string;
  checklist?: ManifestChecklist;
  supplyLocations?: ManifestSupplyLocations;
  accessInstructions?: ManifestAccessInstructions;
  emergencyContacts?: ManifestEmergencyContacts;
}

/**
 * Data Access Layer for cleaning manifests.
 * One manifest per property. All queries scoped by companyId.
 */
export class CleaningManifestDal {
  constructor(private readonly db: PrismaClient) {}

  async findByProperty(companyId: string, propertyId: string) {
    return this.db.cleaningManifest.findFirst({
      where: { companyId, propertyId },
    });
  }

  /** Create or update the manifest for a property. */
  async upsert(input: UpsertManifestInput) {
    const data = {
      checklistJson: input.checklist ? JSON.stringify(input.checklist) : '{}',
      supplyLocationsJson: input.supplyLocations
        ? JSON.stringify(input.supplyLocations)
        : '{}',
      accessInstructionsJson: input.accessInstructions
        ? JSON.stringify(input.accessInstructions)
        : '{}',
      emergencyContactsJson: input.emergencyContacts
        ? JSON.stringify(input.emergencyContacts)
        : '{}',
    };

    return this.db.cleaningManifest.upsert({
      where: { propertyId: input.propertyId },
      create: {
        companyId: input.companyId,
        propertyId: input.propertyId,
        ...data,
      },
      update: data,
    });
  }
}
