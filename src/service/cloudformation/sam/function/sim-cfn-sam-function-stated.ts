import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { samConditionAttribute } from "./sim-cfn-sam-function-properties.js";

/**
 * One member of a SAM record, carried across only where the template states
 * it.
 */
export function stated(
  record: SimCfnTemplateValueRecord,
  name: string,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([member]) => member === name),
  );
}

/**
 * Resources expanded beside a function, conditioned the way the function is.
 */
export function conditioned(
  resources: Record<string, SimCfnTemplateValueRecord>,
  condition: SimCfnTemplateValue | undefined,
): Record<string, SimCfnTemplateValueRecord> {
  return Object.fromEntries(
    Object.entries(resources).map(([id, resource]) => [
      id,
      { ...resource, ...samConditionAttribute(condition) },
    ]),
  );
}
