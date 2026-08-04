import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";

/**
 * One entry of the AWS::DynamoDB::Table properties a global table becomes.
 */
export type SimCfnDynamoDbGlobalTableEntry = readonly [
  string,
  SimCfnTemplateValue,
];

/**
 * The named properties a global table states exactly as an ordinary table
 * does, in the shape the template wrote them.
 *
 * Passing these through untouched is what keeps the rules deciding what a key
 * schema, a projection or a view type is allowed to be in one place: the
 * AWS::DynamoDB::Table path they are handed to, and CreateTable beneath it.
 *
 * A property the template left out is left out here too, rather than carried
 * across as nothing, since the two are read differently further down.
 */
export function simCfnDynamoDbGlobalTableProperty(
  values: SimCfnDynamoDbPropertyValues,
  names: readonly string[],
): readonly SimCfnDynamoDbGlobalTableEntry[] {
  return names.flatMap((name) => {
    return simCfnDynamoDbGlobalTableEntry(name, values.value(name));
  });
}

/**
 * One property of the table being built, where there is one to add.
 *
 * A property built from what a global table splits in two is only there when
 * either half was stated, so the entry it makes comes and goes with it.
 */
export function simCfnDynamoDbGlobalTableEntry(
  name: string,
  value: SimCfnTemplateValue | undefined,
): readonly SimCfnDynamoDbGlobalTableEntry[] {
  return value === undefined ? [] : [[name, value] as const];
}
