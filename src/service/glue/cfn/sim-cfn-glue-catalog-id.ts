import { glueCfnPropertyError } from "./sim-cfn-glue-property-error.js";

interface SimCfnGlueCatalogIdProperties {
  readonly resourceType: string;
  readonly logicalId: string;
  readonly declared: string | undefined;
  readonly simulated: string;
}

/**
 * Check the catalog a Resource names is the one this simulation holds.
 *
 * `CatalogId` is the account whose Data Catalog the database or table belongs
 * to, and CDK writes the deploying account into it. Nothing here crosses
 * accounts, so a catalog id belonging to another account is refused. Creating
 * the resource in this account instead would give a template that deploys and
 * a catalog holding something the template never asked it to.
 */
export function requireSimCfnGlueCatalogId(
  properties: SimCfnGlueCatalogIdProperties,
): void {
  const { declared, simulated } = properties;

  if (declared === undefined || declared === simulated) {
    return;
  }

  throw glueCfnPropertyError(
    properties.resourceType,
    properties.logicalId,
    `CatalogId ${declared} names another account's Data Catalog, and this ` +
      `simulated Glue holds the catalog of account ${simulated}. ` +
      `Cross-account Data Catalog access is not simulated.`,
  );
}
