import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnTemplateSignature } from "../../../cloudformation/stack/update/sim-cfn-template-signature.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { isRecord } from "../../../../util/type-guard/record.js";

/**
 * The AWS::DynamoDB::Table properties a change to which replaces the table.
 *
 * AWS documents `TableName` and `ImportSourceSpecification` as replacing it.
 * A key schema and the local secondary indexes are fixed when DynamoDB creates
 * a table, so a change to either needs a new table too.
 */
const replacingPropertyNames: ReadonlySet<string> = new Set([
  "TableName",
  "KeySchema",
  "LocalSecondaryIndexes",
  "ImportSourceSpecification",
]);

/**
 * Whether a stack update changes a Resource of this type where it is.
 *
 * Only a table is changed in place. A global table is still replaced.
 */
export function simCfnDynamoDbTableUpdatesInPlace(
  resourceTypeName: string,
  current: SimCfnResource,
  updated: SimCfnResource,
): boolean {
  return (
    resourceTypeName === "Table" &&
    !simCfnDynamoDbTableReplaced(current, updated)
  );
}

/**
 * Whether the change between two definitions of a table replaces it.
 *
 * The properties are read as the template writes them, before intrinsic
 * resolution, which is all the update plan has to go on. Two different
 * expressions resolving to the same value replace the table, which is the safe
 * way round to be wrong.
 */
export function simCfnDynamoDbTableReplaced(
  current: SimCfnResource,
  updated: SimCfnResource,
): boolean {
  return (
    replacingSignature(current) !== replacingSignature(updated) ||
    attributeTypeChanged(
      current.properties["AttributeDefinitions"],
      updated.properties["AttributeDefinitions"],
    )
  );
}

/**
 * Whether an attribute both definitions declare changed type.
 *
 * Adding an attribute definition is how an update declares the key of a new
 * index, which DynamoDB takes in place. Retyping one it already has needs a new
 * table. A list the template builds with an intrinsic is compared whole.
 */
function attributeTypeChanged(
  current: SimCfnTemplateValue | undefined,
  updated: SimCfnTemplateValue | undefined,
): boolean {
  const before = attributeTypes(current);
  const after = attributeTypes(updated);

  if (before === undefined || after === undefined) {
    return signature(current) !== signature(updated);
  }

  return [...after].some(([name, type]) => {
    const previous = before.get(name);

    return previous !== undefined && previous !== type;
  });
}

/**
 * Each attribute definition's type signature by its name, when the template
 * writes the list out literally.
 */
function attributeTypes(
  value: SimCfnTemplateValue | undefined,
): ReadonlyMap<string, string> | undefined {
  if (value === undefined) {
    return new Map();
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const types = new Map<string, string>();

  for (const entry of value as readonly SimCfnTemplateValue[]) {
    const name = isRecord(entry) ? entry["AttributeName"] : undefined;

    if (typeof name !== "string") {
      return undefined;
    }

    types.set(
      name,
      signature((entry as SimCfnTemplateValueRecord)["AttributeType"]),
    );
  }

  return types;
}

/**
 * Whether two values read off a resolved template differ.
 *
 * A value the template leaves out reads as null on both sides.
 */
export function simCfnDynamoDbTableValueDiffers(
  before: unknown,
  after: unknown,
): boolean {
  // An absent value in an array is written as null, so either side being
  // absent reads the same.
  return jsonStringify([before]) !== jsonStringify([after]);
}

/**
 * A signature for the properties a change to which replaces the table.
 */
function replacingSignature(resource: SimCfnResource): string {
  return simCfnTemplateSignature(
    Object.fromEntries(
      Object.entries(resource.properties).filter(([name]) =>
        replacingPropertyNames.has(name),
      ),
    ),
  );
}

function signature(value: SimCfnTemplateValue | undefined): string {
  return value === undefined ? "" : simCfnTemplateSignature(value);
}
