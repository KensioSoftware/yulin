import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Read a CloudFormation property as the string an SNS attribute carries.
 *
 * SNS holds every attribute as a string, and CloudFormation carries the same
 * settings as booleans, numbers and JSON documents. A `FilterPolicy` is written
 * as an object in a template and set as a JSON string through the API, which is
 * the same conversion `RawMessageDelivery: true` needs, so both are done here
 * rather than one property at a time.
 *
 * What each string then has to be is left to simulated SNS, which is what a
 * request through the SDK is held to.
 */
export function simCfnSnsAttributeValue(value: SimCfnTemplateValue): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return jsonStringify(value);
}
