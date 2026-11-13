import { createHash } from "node:crypto";

import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";

/**
 * A destination stated as an `Fn::If` with `AWS::NoValue` on one branch, read
 * the way the SAM translator reads it.
 */
export interface SamDestinationCondition {
  /** The condition under which SAM's own queue or topic is created. */
  readonly condition: string;

  /** The ARN the template states for the other branch. */
  readonly arn: SimCfnTemplateValue;

  /** The conditions SAM adds to the template to say that. */
  readonly conditions: Record<string, SimCfnTemplateValueRecord>;
}

/**
 * Where a destination's `Fn::If` leaves the destination unstated, SAM creates
 * its queue or topic for that branch.
 *
 * `Fn::If [C, AWS::NoValue, arn]` creates it under `C`. `Fn::If [C, arn,
 * AWS::NoValue]` creates it under a condition SAM adds for `Fn::Not C`. A
 * function with a condition of its own adds a third, both conditions joined by
 * `Fn::And`. SAM names each condition it adds after the conditions it joins,
 * with the first ten hex digits of the SHA-1 of the function's logical id on
 * the end, and so does this.
 *
 * Anything else, including `AWS::NoValue` on both branches, is a destination
 * stated as it is, and this answers nothing.
 */
export function samDestinationCondition(
  logicalId: string,
  stated: SimCfnTemplateValue | undefined,
  functionCondition: SimCfnTemplateValue | undefined,
): SamDestinationCondition | undefined {
  const branches = isSamTemplateRecord(stated) ? stated["Fn::If"] : undefined;

  if (!Array.isArray(branches) || branches.length !== 3) {
    return undefined;
  }

  const [condition, whenTrue, whenFalse] = branches as [
    SimCfnTemplateValue,
    SimCfnTemplateValue,
    SimCfnTemplateValue,
  ];

  if (
    typeof condition !== "string" ||
    isNoValue(whenTrue) === isNoValue(whenFalse)
  ) {
    return undefined;
  }

  const suffix = createHash("sha1")
    .update(logicalId)
    .digest("hex")
    .slice(0, 10);
  const created = isNoValue(whenFalse) ? `NOT${condition}${suffix}` : condition;
  const conditions = new Map<string, SimCfnTemplateValueRecord>();
  let named = created;

  if (created !== condition) {
    conditions.set(created, { "Fn::Not": [{ Condition: condition }] });
  }

  if (typeof functionCondition === "string") {
    named = `${functionCondition}AND${created}${suffix}`;
    conditions.set(named, {
      "Fn::And": [{ Condition: functionCondition }, { Condition: created }],
    });
  }

  return {
    condition: named,
    arn: isNoValue(whenTrue) ? whenFalse : whenTrue,
    conditions: Object.fromEntries(conditions),
  };
}

function isNoValue(value: SimCfnTemplateValue | undefined): boolean {
  return isSamTemplateRecord(value) && value["Ref"] === "AWS::NoValue";
}
