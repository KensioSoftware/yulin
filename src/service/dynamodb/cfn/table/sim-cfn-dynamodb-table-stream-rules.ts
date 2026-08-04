import { SimCfnDynamoDbPropertyRules } from "../property/sim-cfn-dynamodb-property-rules.js";
import { dynamoDbTableResourceTypeName } from "../sim-cfn-dynamodb-resource-type.js";

/**
 * The StreamSpecification properties this simulation acts on.
 *
 * CloudFormation's StreamSpecification is not the SDK's: it has no
 * `StreamEnabled` field at all, so a template declaring the property at all is
 * asking for a stream, and the view type is the only thing left to say.
 */
const simulatedStreamPropertyNames: ReadonlySet<string> = new Set([
  "StreamViewType",
]);

/**
 * Real StreamSpecification properties this simulation does not model.
 *
 * The nested `ResourcePolicy` is a policy on the stream rather than on the
 * table, and is a different property from the table's own `ResourcePolicy`, so
 * it is named here rather than left to read as a property that does not exist.
 */
const unsimulatedStreamPropertyNames: ReadonlySet<string> = new Set([
  "ResourcePolicy",
]);

/**
 * The rules a table's `StreamSpecification` is read under.
 *
 * This is the table's own property rule applied a level down, as the index
 * rules are. A real property that is not simulated skips the table, since a
 * stream deployed without a policy the template asked for would be read by
 * whatever that policy was meant to keep out.
 */
export function simCfnDynamoDbTableStreamRules(
  logicalId: string,
): SimCfnDynamoDbPropertyRules {
  return new SimCfnDynamoDbPropertyRules({
    resourceTypeName: dynamoDbTableResourceTypeName,
    logicalId,
    kind: "StreamSpecification",
    simulated: simulatedStreamPropertyNames,
    unsimulated: unsimulatedStreamPropertyNames,
  });
}
