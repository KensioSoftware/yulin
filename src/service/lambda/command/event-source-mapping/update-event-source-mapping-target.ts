import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSqsPollQueues } from "../../../sqs/poll/sim-sqs-poll-queues.js";
import type { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceMappingTarget } from "../../event-source/sim-lambda-event-source-mapping-update.js";
import { simLambdaEventSourceArnOf } from "../../event-source/sim-lambda-event-source-arn.js";
import { SimLambdaEventSourceReachable } from "../../event-source/sim-lambda-event-source-reachable.js";
import { SimLambdaEventSourceRolePermissions } from "../../event-source/sim-lambda-event-source-role-permissions.js";
import type { SimLambdaKinesisStreams } from "../../event-source/stream/kinesis/sim-lambda-kinesis-streams.js";
import type { SimLambdaEventSourceStreams } from "../../event-source/stream/sim-lambda-event-source-streams.js";
import { simLambdaFunctionReferenceOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";

export interface SimLambdaEventSourceMappingRetargetProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly queues: SimSqsPollQueues;
  readonly streams: SimLambdaEventSourceStreams;
  readonly kinesisStreams: SimLambdaKinesisStreams;
}

/**
 * The function an UpdateEventSourceMapping request moves a mapping onto,
 * checked as CreateEventSourceMapping checks the one a mapping starts with. A
 * request naming no function leaves the mapping where it is.
 *
 * The caller has to be allowed the update on the new function as well as the
 * old one, the function and any qualifier have to exist, and the new
 * function's execution role has to be able to read the event source.
 */
export async function simLambdaEventSourceMappingTargetOf(
  properties: SimLambdaEventSourceMappingRetargetProperties,
  functionName: string | undefined,
  mapping: SimLambdaEventSourceMapping,
  caller: SimAwsCaller | undefined,
): Promise<SimLambdaEventSourceMappingTarget | undefined> {
  if (functionName === undefined) {
    return undefined;
  }

  const { functions, iam } = properties;
  const reference = simLambdaFunctionReferenceOf(functionName);

  new FunctionUrlAuthorizer({
    iam,
    action: "lambda:UpdateEventSourceMapping",
  }).authorize(
    functions.functionArn(reference.functionName, reference.qualifier),
    caller,
  );

  const target = functions.requireTarget(
    reference.functionName,
    reference.qualifier,
  );
  const eventSourceArn = simLambdaEventSourceArnOf(mapping.eventSourceArn);
  const { roleArn } = target.simFunction;

  new SimLambdaEventSourceRolePermissions({ iam }).assertMayPoll(
    roleArn,
    eventSourceArn,
  );
  await new SimLambdaEventSourceReachable(properties).assertReachable(
    roleArn,
    eventSourceArn,
  );

  return { ...reference, functionArn: target.resource.arn };
}
