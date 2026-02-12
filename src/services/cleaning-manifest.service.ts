import { prisma } from '../db/client';
import {
  CleaningManifestDal,
  type ManifestChecklist,
  type ManifestSupplyLocations,
  type ManifestAccessInstructions,
  type ManifestEmergencyContacts,
} from '../dal/cleaning-manifest.dal';
import { startTimer } from '../telemetry/timing';

const manifestDal = new CleaningManifestDal(prisma);

export interface CleaningManifestResult {
  propertyId: string;
  checklist: ManifestChecklist;
  supplyLocations: ManifestSupplyLocations;
  accessInstructions: ManifestAccessInstructions;
  emergencyContacts: ManifestEmergencyContacts;
  updatedAt: string;
}

/**
 * Default manifest returned when no manifest exists for the property yet.
 */
function defaultManifest(propertyId: string): CleaningManifestResult {
  return {
    propertyId,
    checklist: {
      items: [
        'Strip and remake all beds with fresh linens',
        'Clean all bathrooms (toilets, sinks, showers, mirrors)',
        'Vacuum and mop all floors',
        'Wipe down kitchen counters and appliances',
        'Empty all trash cans and replace liners',
        'Check and restock toiletries (soap, shampoo, toilet paper)',
        'Dust all surfaces and furniture',
        'Clean inside microwave and oven',
        'Wipe light switches and door handles',
        'Set thermostat to guest-ready temperature',
        'Lock all doors and windows when leaving',
      ],
    },
    supplyLocations: {
      locations: [
        '{{SUPPLY_CLOSET_LOCATION}}',
        '{{LINEN_STORAGE_LOCATION}}',
      ],
    },
    accessInstructions: {
      instructions:
        'Use lockbox code {{LOCKBOX_CODE}} at the front door. If electronic lock, use code {{ELECTRONIC_LOCK_CODE}}.',
    },
    emergencyContacts: {
      contacts: [
        { name: '{{PROPERTY_OWNER_NAME}}', role: 'owner', phonePlaceholder: '{{OWNER_PHONE}}' },
        { name: '{{PM_ON_CALL_NAME}}', role: 'property_manager', phonePlaceholder: '{{PM_PHONE}}' },
      ],
    },
    updatedAt: new Date().toISOString(),
  };
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Fetch the cleaning manifest for a property.
 * Returns a default manifest if none exists yet.
 */
export async function getCleaningManifest(
  companyId: string,
  propertyId: string,
): Promise<CleaningManifestResult> {
  const timer = startTimer('service.getCleaningManifest');
  try {
    const row = await manifestDal.findByProperty(companyId, propertyId);
    if (!row) return defaultManifest(propertyId);

    return {
      propertyId: row.propertyId,
      checklist: safeParse<ManifestChecklist>(row.checklistJson, { items: [] }),
      supplyLocations: safeParse<ManifestSupplyLocations>(row.supplyLocationsJson, {
        locations: [],
      }),
      accessInstructions: safeParse<ManifestAccessInstructions>(
        row.accessInstructionsJson,
        { instructions: '' },
      ),
      emergencyContacts: safeParse<ManifestEmergencyContacts>(row.emergencyContactsJson, {
        contacts: [],
      }),
      updatedAt: row.updatedAt.toISOString(),
    };
  } finally {
    timer.stop();
  }
}
