import { prisma } from '../db/client';
import { CleaningRollupDal } from '../dal/cleaning-rollup.dal';
import type { CleaningRollupResult } from '../dal/cleaning-rollup.dal';

const dal = new CleaningRollupDal(prisma);

export interface GetCleaningRollupInput {
  companyId: string;
  propertyId?: string;
  dateFrom: Date;
  dateTo: Date;
}

export async function getCleaningRollup(
  input: GetCleaningRollupInput,
): Promise<CleaningRollupResult> {
  return dal.getRollup({
    companyId: input.companyId,
    propertyId: input.propertyId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
}
