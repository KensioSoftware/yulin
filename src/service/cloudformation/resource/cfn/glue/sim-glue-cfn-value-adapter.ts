import { SimGlueDatabase } from "../../../../glue/database/sim-glue-database.js";
import { SimGlueTable } from "../../../../glue/table/sim-glue-table.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimGlueDatabaseCfn } from "./sim-glue-database-cfn.js";
import { SimGlueTableCfn } from "./sim-glue-table-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated Glue Resource.
 */
export function glueValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::Glue::Database" &&
    properties.simResource instanceof SimGlueDatabase
  ) {
    return new SimGlueDatabaseCfn({ database: properties.simResource });
  }

  if (
    properties.type === "AWS::Glue::Table" &&
    properties.simResource instanceof SimGlueTable
  ) {
    return new SimGlueTableCfn({ table: properties.simResource });
  }

  return undefined;
}
