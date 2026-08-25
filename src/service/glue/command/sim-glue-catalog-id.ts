import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimGlueInvalidInputException } from "../error/sim-glue.error.js";

/**
 * Check the catalog a request names is the one this simulation holds.
 *
 * `CatalogId` defaults to the caller's own account on real Glue, and naming
 * another account's catalog reaches that account's Data Catalog through a
 * resource policy. Nothing here crosses accounts, so a catalog id belonging to
 * another account is refused rather than quietly answered from this one.
 */
export function requireSimGlueCatalogId(
  accountRegionScope: SimAwsAccountRegionScope,
  catalogId: string | undefined,
): void {
  if (catalogId === undefined || catalogId === accountRegionScope.accountId) {
    return;
  }

  throw new SimGlueInvalidInputException(
    `Simulated Glue holds the Data Catalog of account ` +
      `${accountRegionScope.accountId}, and CatalogId ${catalogId} names ` +
      `another account. Cross-account Data Catalog access is not simulated.`,
  );
}
