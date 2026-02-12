import { PrismaClient } from '@prisma/client';

export interface CreateIncidentInput {
  companyId: string;
  propertyId: string;
  taskId: string;
  type: string; // NO_SHOW | LATE_START | DAMAGE | SUPPLIES | ACCESS | OTHER
  severity: string; // low | med | high
  description: string;
}

/**
 * Data Access Layer for incidents.
 * All queries scoped by companyId.
 */
export class IncidentDal {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateIncidentInput) {
    return this.db.incident.create({
      data: {
        companyId: input.companyId,
        propertyId: input.propertyId,
        taskId: input.taskId,
        type: input.type,
        severity: input.severity,
        description: input.description,
      },
    });
  }

  async findByTask(companyId: string, taskId: string) {
    return this.db.incident.findMany({
      where: { companyId, taskId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByCompany(companyId: string, limit = 100) {
    return this.db.incident.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
