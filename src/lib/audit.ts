import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

type AuditInput = {
  userId?: string | null;
  action: AuditAction;
  resource?: string | null;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
};

export async function audit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId || null,
        action: input.action,
        resource: input.resource || null,
        entityId: input.entityId || null,
        details: input.details ? String(input.details).slice(0, 2000) : null,
        ipAddress: input.ipAddress || null,
      },
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria:", error);
  }
}