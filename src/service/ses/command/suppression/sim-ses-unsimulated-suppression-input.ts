import { SimSesUnsupportedOperationException } from "../../error/sim-ses.error.js";

/**
 * Refuse a request aimed at a tenant's suppression list.
 *
 * Multi-tenancy is not simulated, and a tenant's list is a different list from
 * the account's. Reading the account's when a caller asked for a tenant's
 * would answer with somebody else's addresses.
 */
export function refuseSimSesTenantName(tenantName: string | undefined): void {
  if (tenantName !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Tenant-level suppression lists are not simulated, so the suppression " +
        "commands refuse TenantName rather than answering for the " +
        "account-level list instead",
    );
  }
}
