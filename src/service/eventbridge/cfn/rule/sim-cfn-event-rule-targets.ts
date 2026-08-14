import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * One target of a rule, as this simulation takes it.
 */
export interface SimCfnEventRuleTarget {
  readonly Id: string;
  readonly Arn: string;
  readonly Input?: string | undefined;
}

/**
 * What a template can say about a target that this simulation does not model.
 *
 * `InputPath` and `InputTransformer` are the two most likely to be reached for,
 * and the two whose absence would be least visible: a target receiving the
 * whole event when the template asked for one field of it looks like it worked.
 */
const unsimulatedTargetProperties: readonly (readonly [string, string])[] = [
  ["InputPath", "a target receives the whole event or its fixed Input"],
  ["InputTransformer", "a target receives the whole event or its fixed Input"],
  ["RoleArn", "a rule reaches its target as the EventBridge service principal"],
  ["DeadLetterConfig", "a failed delivery is recorded rather than sent on"],
  ["RetryPolicy", "a delivery is attempted once"],
  ["SqsParameters", "a FIFO queue target is not simulated"],
  ["KinesisParameters", "Kinesis is not a simulated target"],
  ["EcsParameters", "ECS is not a simulated target"],
  ["BatchParameters", "Batch is not a simulated target"],
  ["HttpParameters", "an API destination is not a simulated target"],
  ["RunCommandParameters", "Run Command is not a simulated target"],
  ["RedshiftDataParameters", "Redshift is not a simulated target"],
  ["SageMakerPipelineParameters", "SageMaker is not a simulated target"],
  ["AppSyncParameters", "AppSync is not a simulated target"],
];

/**
 * Read one entry of a rule's inline `Targets` list.
 *
 * A property this simulation gives no behaviour to is refused naming itself,
 * rather than the target being created without it, so a rule that would not
 * behave as written fails the deployment instead of quietly under-delivering.
 */
function readTarget(
  target: unknown,
  refuse: (reason: string) => Error,
): SimCfnEventRuleTarget {
  if (!isRecord(target)) {
    throw refuse("each entry of Targets is an object");
  }

  // Read as a set of the keys the template wrote, rather than by looking each
  // one up on the target, so the property names stay data.
  const declared = new Set(Object.keys(target));

  for (const [property, reason] of unsimulatedTargetProperties) {
    if (declared.has(property)) {
      throw refuse(
        `target ${property} is not simulated, so the Resource is refused ` +
          `rather than deployed without it: ${reason}`,
      );
    }
  }

  const id = target["Id"];

  if (typeof id !== "string" || id === "") {
    throw refuse("each entry of Targets needs an Id");
  }

  const arn = target["Arn"];

  if (typeof arn !== "string" || arn === "") {
    throw refuse(`target ${id} needs an Arn`);
  }

  const input = target["Input"];

  if (input !== undefined && typeof input !== "string") {
    throw refuse(`target ${id} Input must be a string of JSON`);
  }

  return { Id: id, Arn: arn, Input: input };
}

/**
 * Read a rule's inline `Targets` list.
 *
 * A rule with no targets is a rule that matches events and sends them nowhere,
 * which real EventBridge lets you have, so an absent list is none rather than a
 * refusal.
 */
export function simCfnEventRuleTargets(
  targets: SimCfnTemplateValue | undefined,
  refuse: (reason: string) => Error,
): readonly SimCfnEventRuleTarget[] {
  if (targets === undefined) {
    return [];
  }

  if (!Array.isArray(targets)) {
    throw refuse("Targets is a list");
  }

  return targets.map((target) => readTarget(target, refuse));
}
