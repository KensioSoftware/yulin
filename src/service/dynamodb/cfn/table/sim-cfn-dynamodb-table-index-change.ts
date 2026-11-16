import { simCfnTemplateSignature } from "../../../cloudformation/stack/update/sim-cfn-template-signature.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simCfnDynamoDbTableReplaced } from "./sim-cfn-dynamodb-table-change.js";

/**
 * The parts of a global secondary index a stack update can change in place.
 *
 * AWS applies a change to an index's capacity settings with no interruption,
 * and refuses a change to anything else about an index that stays.
 */
const indexCapacityPropertyNames: ReadonlySet<string> = new Set([
  "ContributorInsightsSpecification",
  "OnDemandThroughput",
  "ProvisionedThroughput",
  "WarmThroughput",
]);

/**
 * Refuse a change to an index a table updated in place keeps, beyond its
 * capacity.
 *
 * DynamoDB has no way to change an index's key schema or projection. A
 * replaced table builds its indexes afresh, so this applies to an in-place
 * update only.
 */
export function assertSimCfnDynamoDbNoIndexRedefined(change: {
  readonly currentResource: SimCfnResource;
  readonly updatedResource: SimCfnResource;
  readonly currentProperties: SimCfnTemplateValueRecord;
  readonly updatedProperties: SimCfnTemplateValueRecord;
}): void {
  const [name] = simCfnDynamoDbTableReplaced(
    change.currentResource,
    change.updatedResource,
  )
    ? []
    : redefinedIndexNames(change.currentProperties, change.updatedProperties);

  if (name !== undefined) {
    throw new SimDynamoDbValidationException(
      `Cannot update GSI ${name}'s properties other than its provisioned ` +
        `throughput and contributor insights specification. Create a new ` +
        `GSI with a different name instead`,
    );
  }
}

/**
 * The global secondary indexes both definitions declare, whose definitions
 * differ in more than capacity.
 */
function redefinedIndexNames(
  current: SimCfnTemplateValueRecord,
  updated: SimCfnTemplateValueRecord,
): readonly string[] {
  const before = indexesByName(current["GlobalSecondaryIndexes"]);
  const after = indexesByName(updated["GlobalSecondaryIndexes"]);

  return [...after].flatMap(([name, index]) => {
    const previous = before.get(name);

    return previous === undefined ||
      indexSignature(previous) === indexSignature(index)
      ? []
      : [name];
  });
}

/**
 * Each global secondary index by its name, skipping any whose name is not a
 * string, which reading the index refuses elsewhere.
 */
function indexesByName(
  value: SimCfnTemplateValue | undefined,
): ReadonlyMap<string, SimCfnTemplateValueRecord> {
  const indexes = new Map<string, SimCfnTemplateValueRecord>();

  if (!Array.isArray(value)) {
    return indexes;
  }

  for (const entry of value as readonly SimCfnTemplateValue[]) {
    if (isRecord(entry) && typeof entry["IndexName"] === "string") {
      indexes.set(entry["IndexName"], entry);
    }
  }

  return indexes;
}

/**
 * A signature for an index that leaves its capacity settings out.
 */
function indexSignature(index: SimCfnTemplateValueRecord): string {
  return simCfnTemplateSignature(
    Object.fromEntries(
      Object.entries(index).filter(
        ([name]) => !indexCapacityPropertyNames.has(name),
      ),
    ),
  );
}
