import { SimCfnGeneratedResourceName } from "../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import { simGlueFolded } from "../database/sim-glue-catalog-name.js";

/**
 * The longest name the Data Catalog accepts for a database or a table.
 *
 * Glue states the limit in UTF-8 bytes and `SimCfnGeneratedResourceName` trims
 * by character. The two come to the same thing here. A logical ID is
 * alphanumeric, a stack name adds only hyphens, and the tail is hex.
 */
const maximumNameLength = 255;

/**
 * The name CloudFormation gives a database or a table whose template does not
 * name it.
 *
 * One function covers both because the Data Catalog gives a database and a
 * table the same name rules. The name is folded to lowercase the way the
 * catalog folds any name it stores, for compatibility with Apache Hive.
 */
export function simCfnGlueGeneratedName(resource: SimCfnResource): string {
  return simGlueFolded(
    new SimCfnGeneratedResourceName({
      stackName: resource.stackName,
      logicalId: resource.logicalId,
      maximumLength: maximumNameLength,
    }).value,
  );
}
