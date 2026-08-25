import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  simGlueCatalogArn,
  simGlueDatabaseArn,
  simGlueTableArn,
} from "./sim-glue-arn.js";

/**
 * Every ARN an operation on a Data Catalog resource has to be allowed on.
 *
 * A resource needs permission on itself and on all of its ancestors, and a
 * delete needs permission on its children too. These build the list each
 * operation authorizes against, outermost first, so a refusal names the
 * outermost resource the policy left out.
 *
 * https://docs.aws.amazon.com/glue/latest/dg/glue-specifying-resource-arns.html
 */
export function simGlueDatabaseResources(
  scope: SimAwsAccountRegionScope,
  databaseName: string,
): readonly string[] {
  return [simGlueCatalogArn(scope), simGlueDatabaseArn(scope, databaseName)];
}

/** The catalog, the database and the table. */
export function simGlueTableResources(
  scope: SimAwsAccountRegionScope,
  databaseName: string,
  tableName: string,
): readonly string[] {
  return [
    ...simGlueDatabaseResources(scope, databaseName),
    simGlueTableArn(scope, databaseName, tableName),
  ];
}

/** The catalog, the database, and every table going down with it. */
export function simGlueDatabaseDeletionResources(
  scope: SimAwsAccountRegionScope,
  databaseName: string,
  tableNames: readonly string[],
): readonly string[] {
  return [
    ...simGlueDatabaseResources(scope, databaseName),
    ...tableNames.map((tableName) =>
      simGlueTableArn(scope, databaseName, tableName),
    ),
  ];
}
