import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";

/**
 * The IAM action SAM grants the execution Role for each kind of asynchronous
 * delivery target, keyed by the `Type` a `DeadLetterQueue` or an
 * `EventInvokeConfig` destination states.
 */
const deliveryActions: ReadonlyMap<string, string> = new Map([
  ["SQS", "sqs:SendMessage"],
  ["SNS", "sns:Publish"],
  ["Lambda", "lambda:InvokeFunction"],
  ["EventBridge", "events:PutEvents"],
  ["S3Bucket", "s3:PutObject"],
]);

/**
 * One place a function's asynchronous results are sent, as SAM states it.
 */
export interface SamAsyncTarget {
  readonly type: string;
  readonly arn: SimCfnTemplateValueRecord | string;
}

/**
 * The `Type` a SAM delivery target states, or an empty string for one that
 * states none a template could resolve to a name.
 */
export function samAsyncTargetType(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The inline policy SAM puts on the generated execution Role so the function
 * may deliver to a target. A target of a type SAM grants nothing for leaves
 * the Role as it is.
 */
export function samAsyncTargetPolicies(
  policyName: string,
  target: SamAsyncTarget,
): readonly SimCfnTemplateValueRecord[] {
  const action = deliveryActions.get(target.type);

  return action === undefined
    ? []
    : [
        {
          PolicyName: policyName,
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: deliveryStatements(action, target),
          },
        },
      ];
}

/**
 * The statements allowing delivery to one target.
 *
 * An S3 destination writes objects into the bucket, which `s3:PutObject`
 * allows on the objects' ARNs, and Lambda also lists the bucket.
 */
function deliveryStatements(
  action: string,
  target: SamAsyncTarget,
): SimCfnTemplateValueRecord[] {
  return target.type === "S3Bucket"
    ? [
        { Effect: "Allow", Action: "s3:ListBucket", Resource: target.arn },
        {
          Effect: "Allow",
          Action: action,
          Resource: { "Fn::Join": ["", [target.arn, "/*"]] },
        },
      ]
    : [{ Effect: "Allow", Action: action, Resource: target.arn }];
}
