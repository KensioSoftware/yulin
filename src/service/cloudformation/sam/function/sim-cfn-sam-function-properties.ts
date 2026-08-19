import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";

/**
 * The Resource attributes the Lambda function carries over. They are the ones
 * saying whether it is created at all and what has to exist first.
 */
const attributeNames = new Set(["Condition", "DependsOn"]);

/**
 * The properties whose names and meanings are the same on both Resource types,
 * so expanding them is carrying them across.
 */
const propertyNames = new Set([
  "Description",
  "Environment",
  "FunctionName",
  "Handler",
  "MemorySize",
  "Runtime",
  "Timeout",
]);

/**
 * The `Properties` of the SAM Resource. A function taking everything it has
 * from `Globals` can leave the section out.
 */
export function samResourceProperties(
  resource: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const properties = resource["Properties"];

  return isSamTemplateRecord(properties) ? properties : {};
}

/**
 * The Resource attributes the expanded Lambda function carries.
 */
export function samCarriedAttributes(
  resource: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return picked(resource, attributeNames);
}

/**
 * The `Condition` attribute a Resource expanded beside the function carries.
 *
 * Everything the function was expanded with exists because the function does,
 * so a function the template conditioned out leaves none of them behind for
 * the Stack to create.
 */
export function samConditionAttribute(
  condition: SimCfnTemplateValue | undefined,
): SimCfnTemplateValueRecord {
  return condition === undefined ? {} : { Condition: condition };
}

/**
 * The properties the expanded Lambda function carries, from the SAM function
 * properties the `Globals` defaults have already been merged into.
 */
export function samCarriedProperties(
  functionProperties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return {
    ...picked(functionProperties, propertyNames),
    ...inlineCode(functionProperties),
  };
}

/**
 * The `Code` of a function whose source the template holds inline.
 */
function inlineCode(
  functionProperties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const source = functionProperties["InlineCode"];

  return typeof source === "string" ? { Code: { ZipFile: source } } : {};
}

/**
 * The entries of a record whose keys are in the given set.
 */
function picked(
  record: SimCfnTemplateValueRecord,
  names: ReadonlySet<string>,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => names.has(name)),
  );
}
