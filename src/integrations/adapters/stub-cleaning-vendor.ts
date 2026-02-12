/**
 * @deprecated Phase 0 stub. Replaced by vendor-specific adapters in Phase 2:
 * - StubTurnoAdapter (stub-turno.ts)
 * - StubBreezewayAdapter (stub-breezeway.ts)
 * - StubHandyAdapter (stub-handy.ts)
 *
 * Kept temporarily for backward compatibility. Will be removed after
 * all consumers are migrated.
 */
import { logger } from '../../config/logger';

export interface ExternalTurnover {
  externalId: string;
  propertyExternalId: string;
  checkoutDate: string;
  checkinDate: string;
  guestCount?: number;
}

export interface ICleaningVendorAdapter {
  readonly vendorName: string;
  fetchUpcomingTurnovers(propertyExternalId: string): Promise<ExternalTurnover[]>;
  notifyAssignment(externalTurnoverId: string, cleanerName: string): Promise<void>;
}

export class StubCleaningVendorAdapter implements ICleaningVendorAdapter {
  readonly vendorName = 'StubVendor';

  async fetchUpcomingTurnovers(
    propertyExternalId: string,
  ): Promise<ExternalTurnover[]> {
    logger.debug(
      { propertyExternalId },
      '[StubCleaningVendor] fetchUpcomingTurnovers called (deprecated)',
    );
    return [
      {
        externalId: 'stub-turnover-001',
        propertyExternalId,
        checkoutDate: '2026-02-15',
        checkinDate: '2026-02-16',
        guestCount: 4,
      },
    ];
  }

  async notifyAssignment(
    externalTurnoverId: string,
    cleanerName: string,
  ): Promise<void> {
    logger.debug(
      { externalTurnoverId, cleanerName },
      '[StubCleaningVendor] notifyAssignment called (deprecated)',
    );
  }
}
