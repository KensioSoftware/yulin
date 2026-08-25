import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The start of every Glue ARN in one account and region.
 */
export function simGlueArnPrefix(scope: SimAwsAccountRegionScope): string {
  return `arn:aws:glue:${scope.regionName}:${scope.accountId}:`;
}

/**
 * The ARN of the Data Catalog itself.
 *
 * An operation that names no particular database authorizes against this. Real
 * Glue policies name the catalog alongside the databases and tables a
 * principal may reach, so a policy written for real Glue already carries it.
 */
export function simGlueCatalogArn(scope: SimAwsAccountRegionScope): string {
  return `${simGlueArnPrefix(scope)}catalog`;
}

/**
 * The ARN of a database.
 */
export function simGlueDatabaseArn(
  scope: SimAwsAccountRegionScope,
  databaseName: string,
): string {
  return `${simGlueArnPrefix(scope)}database/${databaseName}`;
}

/**
 * The ARN of a table, which names the database holding it.
 */
export function simGlueTableArn(
  scope: SimAwsAccountRegionScope,
  databaseName: string,
  tableName: string,
): string {
  return `${simGlueArnPrefix(scope)}table/${databaseName}/${tableName}`;
}
