import type { SimAws } from "../../../aws/sim-aws.js";
import { namesSimCfnUnansweredAttribute } from "../../../cloudformation/resource/cfn/sim-cfn-unanswered-attribute.js";
import type { SimCloudFrontLambdaFunctionAssociation } from "../../command/create-distribution/create-distribution.command.js";
import { isSimulatedEdgeEventType } from "../../edge/sim-cf-edge-association-checks.js";
import { readEdgeFunctionArnParts } from "../../edge/sim-cf-edge-function-arn.js";
import { findSimCfEdgeFunctionVersion } from "../../edge/sim-cf-edge-function-version.js";

/**
 * What one Lambda@Edge association is decided against.
 */
export interface SimCfnCfEdgeSkipContext {
  /** Where the function version behind an ARN is looked for. */
  readonly simAws: SimAws;

  /** Every Resource the Stack declaring the Distribution holds. */
  readonly stackResourceLogicalIds: ReadonlySet<string>;
}

/**
 * Why this simulation cannot run one Lambda@Edge association, or nothing where
 * it can.
 *
 * Three answers leave an association out. The event type has no hook here. The
 * ARN names a function version this simulation does not hold, as a template
 * pointing at a function in a real account does. Or the ARN is the stand-in a
 * Resource in this Stack answered an `Fn::GetAtt` with, having no ARN of its
 * own to give.
 *
 * Everything else is left where `CreateDistribution` meets it, including the
 * mistakes real CloudFront refuses. A template carrying one of those fails a
 * real deploy too.
 */
export function simCfnCfEdgeSkipReason(
  association: SimCloudFrontLambdaFunctionAssociation,
  context: SimCfnCfEdgeSkipContext,
): string | undefined {
  const { EventType: eventType, LambdaFunctionARN: functionArn } = association;

  if (eventType === undefined || functionArn === undefined) {
    return undefined;
  }

  if (!isSimulatedEdgeEventType(eventType)) {
    return unsimulatedEventReason(eventType, functionArn);
  }

  const arn = readEdgeFunctionArnParts(functionArn);

  if (arn === undefined) {
    return unreadableArnReason(eventType, functionArn, context);
  }

  if (findSimCfEdgeFunctionVersion(context.simAws, arn) !== undefined) {
    return undefined;
  }

  return absentFunctionReason(eventType, functionArn);
}

/**
 * The association is on an event type this simulation has no hook for.
 */
function unsimulatedEventReason(
  eventType: string,
  functionArn: string,
): string {
  return (
    `simulated CloudFront runs a Lambda@Edge function at viewer-request and ` +
    `viewer-response, so the Behavior is deployed without the ${eventType} ` +
    `function ${functionArn} and runs nothing there`
  );
}

/**
 * The ARN names a function version no simulated Lambda holds.
 */
function absentFunctionReason(eventType: string, functionArn: string): string {
  return (
    `Lambda@Edge function ${functionArn} is not held by this simulation, so ` +
    `the Behavior is deployed without it and runs nothing at ${eventType}`
  );
}

/**
 * Why an ARN that does not read as a Lambda@Edge function ARN is left out, or
 * nothing where it is kept.
 *
 * A value written as an ARN is kept, so `CreateDistribution` refuses it the
 * way real CloudFront refuses a malformed ARN or a function outside us-east-1.
 * A value naming a Resource in this Stack is a different thing. It is the
 * stand-in an `Fn::GetAtt` resolves to where the Resource had no attribute to
 * answer with, and the template that wrote it deploys on AWS. CDK writes one
 * for an `experimental.EdgeFunction` outside us-east-1, whose ARN comes from
 * an SSM parameter a support Stack writes and a custom Resource reads back.
 */
function unreadableArnReason(
  eventType: string,
  functionArn: string,
  context: SimCfnCfEdgeSkipContext,
): string | undefined {
  if (
    !namesSimCfnUnansweredAttribute(
      functionArn,
      context.stackResourceLogicalIds,
    )
  ) {
    return undefined;
  }

  return (
    `the Lambda@Edge function ARN is read from ${functionArn}, a Resource in ` +
    `this Stack that had no ARN to answer with, so the Behavior is deployed ` +
    `without it and runs nothing at ${eventType}. A CDK EdgeFunction outside ` +
    `us-east-1 reads its ARN from a support Stack of its own; deploy the ` +
    `whole cloud assembly with deployCdkOut to deploy that Stack too`
  );
}
