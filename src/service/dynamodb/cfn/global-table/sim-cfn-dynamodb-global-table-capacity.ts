import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";
import { simCfnDynamoDbGlobalTableEntry } from "./sim-cfn-dynamodb-global-table-property.js";

interface SimCfnDynamoDbGlobalTableCapacitySources {
  readonly read: SimCfnDynamoDbPropertyValues | undefined;
  readonly write: SimCfnDynamoDbPropertyValues | undefined;
}

/**
 * The `ProvisionedThroughput` a global table's two capacity settings add up to.
 *
 * A global table splits the capacity an ordinary table states in one place:
 * writes are the table's, since every replica takes the same writes, and reads
 * belong to the replica doing them. One replica is one of each, so the two go
 * back together into the property CreateTable takes.
 *
 * Each half is read here rather than passed through, so a capacity the template
 * wrote as something other than a number is refused at the path a global table
 * puts it at rather than at the one an ordinary table would have.
 *
 * A table that states neither half has no `ProvisionedThroughput` at all, which
 * is what an on-demand table looks like. A table stating one of them keeps the
 * gap, so CreateTable refuses it in its own words rather than being handed a
 * capacity nothing asked for.
 */
export function simCfnDynamoDbGlobalTableCapacity(
  sources: SimCfnDynamoDbGlobalTableCapacitySources,
): SimCfnTemplateValueRecord | undefined {
  if (sources.read === undefined && sources.write === undefined) {
    return undefined;
  }

  return Object.fromEntries([
    ...simCfnDynamoDbGlobalTableEntry(
      "ReadCapacityUnits",
      sources.read?.number("ReadCapacityUnits"),
    ),
    ...simCfnDynamoDbGlobalTableEntry(
      "WriteCapacityUnits",
      sources.write?.number("WriteCapacityUnits"),
    ),
  ]);
}
