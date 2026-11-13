import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";
import {
  type SamAsyncTarget,
  samAsyncTargetType,
} from "./sim-cfn-sam-function-async-targets.js";
import { samDestinationCondition } from "./sim-cfn-sam-destination-condition.js";
import { samConditionAttribute } from "./sim-cfn-sam-function-properties.js";

/**
 * The two outcomes an `EventInvokeConfig` can send a record for.
 */
const outcomes = ["OnSuccess", "OnFailure"] as const;

type SamOutcome = (typeof outcomes)[number];

/**
 * The resource SAM creates for a destination naming a `Type` and no
 * `Destination`, for the two types it creates one for.
 */
const createdTargets: ReadonlyMap<
  string,
  {
    readonly suffix: string;
    readonly type: string;
    readonly arn: "Arn" | "Ref";
  }
> = new Map([
  ["SQS", { suffix: "Queue", type: "AWS::SQS::Queue", arn: "Arn" }],
  ["SNS", { suffix: "Topic", type: "AWS::SNS::Topic", arn: "Ref" }],
]);

/**
 * One destination of a SAM function's `EventInvokeConfig`, resolved to the
 * ARN it delivers to, the resource SAM creates for it, if any, and the
 * conditions SAM adds to the template for it.
 */
export interface SamDestination {
  readonly outcome: SamOutcome;
  readonly target: SamAsyncTarget;
  readonly created: Record<string, SimCfnTemplateValueRecord>;
  readonly conditions: Record<string, SimCfnTemplateValueRecord>;
}

/**
 * The destinations a SAM function's `EventInvokeConfig` states, each resolved
 * to the ARN it delivers to and the queue or topic SAM creates for it.
 */
export function samDestinations(
  logicalId: string,
  eventInvokeConfig: SimCfnTemplateValueRecord,
  functionCondition?: SimCfnTemplateValue,
): readonly SamDestination[] {
  const config = eventInvokeConfig["DestinationConfig"];
  const stated = new Map(
    Object.entries(isSamTemplateRecord(config) ? config : {}),
  );

  return outcomes.flatMap((outcome): SamDestination[] => {
    const destination = stated.get(outcome);

    return isSamTemplateRecord(destination)
      ? [samDestination(logicalId, outcome, destination, functionCondition)]
      : [];
  });
}

function samDestination(
  logicalId: string,
  outcome: SamOutcome,
  destination: SimCfnTemplateValueRecord,
  functionCondition: SimCfnTemplateValue | undefined,
): SamDestination {
  const type = samAsyncTargetType(destination["Type"]);
  const stated = destination["Destination"];
  const created = createdTargets.get(type);
  const conditional = samDestinationCondition(
    logicalId,
    stated,
    functionCondition,
  );

  if (created === undefined || (stated !== undefined && !conditional)) {
    return {
      outcome,
      target: { type, arn: stated as SimCfnTemplateValueRecord | string },
      created: {},
      conditions: {},
    };
  }

  const createdId = `${logicalId}EventInvokeConfig${outcome}${created.suffix}`;
  const createdArn =
    created.arn === "Arn"
      ? { "Fn::GetAtt": [createdId, "Arn"] }
      : { Ref: createdId };

  return {
    outcome,
    target: {
      type,
      arn: conditional
        ? { "Fn::If": [conditional.condition, createdArn, conditional.arn] }
        : createdArn,
    },
    created: {
      [createdId]: {
        Type: created.type,
        ...samConditionAttribute(conditional?.condition ?? functionCondition),
      },
    },
    conditions: conditional?.conditions ?? {},
  };
}
