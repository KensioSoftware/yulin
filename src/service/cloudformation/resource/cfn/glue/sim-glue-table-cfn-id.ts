import type { SimGlueTable } from "../../../../glue/table/sim-glue-table.js";

/**
 * What `Fn::GetAtt Id` answers with for an AWS::Glue::Table.
 *
 * **This format is a guess, and nothing has checked it against AWS.**
 * CloudFormation documents that the attribute exists and documents nothing
 * about the value behind it, and the CDK's generated `CfnTable.attrId` carries
 * no description either. A template asserting on this value will agree with
 * this simulation and may disagree with a real deploy.
 *
 * The guess is the Data Catalog's own identity for a table, which is the
 * catalog, the database and the name, joined the way Glue's CloudFormation
 * handlers join a composite identifier. A table id leaving the catalog out
 * would not tell two federated catalogs apart.
 *
 * Confirming it takes one stack deployed to a real account with
 * `!GetAtt Table.Id` as an output. The format lives here alone, so correcting
 * it is this function and the test naming it.
 */
export function simGlueTableCfnId(table: SimGlueTable): string {
  return [table.catalogId, table.databaseName, table.name].join("|");
}
