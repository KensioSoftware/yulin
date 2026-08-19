import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";

/**
 * The partition key a table is created with: the attribute definition DynamoDB
 * takes, and the name its key schema names.
 */
export interface SamSimpleTableKey {
  readonly definition: SimCfnTemplateValueRecord;
  readonly name: SimCfnTemplateValue;
}

/**
 * What SAM calls each attribute type, against what DynamoDB calls it.
 *
 * A `Type` outside this is carried across as the template wrote it.
 * `CreateTable` is the one place that says which attribute types a table can
 * have, and it refuses a type neither of them knows, by name.
 */
const attributeTypes = new Map([
  ["Binary", "B"],
  ["Number", "N"],
  ["String", "S"],
]);

/**
 * The name and type of the key a table naming none is given, which is the key
 * SAM gives it.
 */
const defaultKeyName = "id";
const defaultKeyType = "S";

/**
 * The attribute definition of the table's partition key.
 *
 * Both halves are carried across as the template wrote them, apart from the
 * type name. A key an intrinsic function names is resolved the way the rest of
 * the template is.
 */
export function samSimpleTablePrimaryKey(
  tableProperties: SimCfnTemplateValueRecord,
): SamSimpleTableKey {
  const primaryKey = tableProperties["PrimaryKey"];

  if (!isSamTemplateRecord(primaryKey)) {
    return samKey(defaultKeyName, defaultKeyType);
  }

  return samKey(
    primaryKey["Name"] ?? defaultKeyName,
    samAttributeType(primaryKey["Type"]),
  );
}

/**
 * One partition key, as both halves of what the table is created from.
 */
function samKey(
  name: SimCfnTemplateValue,
  type: SimCfnTemplateValue,
): SamSimpleTableKey {
  return {
    definition: { AttributeName: name, AttributeType: type },
    name,
  };
}

/**
 * What DynamoDB calls the attribute type a key names.
 */
function samAttributeType(
  type: SimCfnTemplateValue | undefined,
): SimCfnTemplateValue {
  if (typeof type !== "string") {
    return type ?? defaultKeyType;
  }

  return attributeTypes.get(type) ?? type;
}
