import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimSnsFunctionEndpointArn } from "./sim-sns-function-endpoint-arn.js";
import { SimSnsQueueEndpointArn } from "./sim-sns-queue-endpoint-arn.js";
import {
  simSnsLambdaProtocol,
  simSnsSqsProtocol,
  type SimSnsSubscriptionProtocol,
} from "./sim-sns-subscription-protocol.js";

/**
 * Where a subscription delivers, whichever kind of endpoint its protocol
 * implies.
 *
 * Every protocol simulated names its endpoint by an ARN, and every delivery
 * needs the same three things from it: the ARN itself, and the Account and
 * Region to resolve the endpoint in. What kind of resource it is belongs to the
 * protocol's own endpoint type.
 */
export interface SimSnsSubscriptionEndpoint {
  readonly value: string;
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
}

/**
 * Read the endpoint a Subscribe request names, for the protocol it named.
 *
 * The protocol decides what the endpoint has to be, so an SQS queue ARN over
 * the `lambda` protocol is refused here rather than at delivery time. Real SNS
 * validates the endpoint against the protocol at `Subscribe` time too.
 */
export function requireSimSnsSubscriptionEndpoint(
  protocol: SimSnsSubscriptionProtocol,
  endpoint: string | undefined,
): SimSnsSubscriptionEndpoint {
  switch (protocol) {
    case simSnsSqsProtocol: {
      return SimSnsQueueEndpointArn.parse(endpoint ?? "");
    }
    case simSnsLambdaProtocol: {
      return SimSnsFunctionEndpointArn.parse(endpoint ?? "");
    }
  }
}
