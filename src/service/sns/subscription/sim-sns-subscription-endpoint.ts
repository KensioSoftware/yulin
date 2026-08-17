import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimSnsPhoneNumber } from "../sms/sim-sns-phone-number.js";
import { SimSnsFunctionEndpointArn } from "./sim-sns-function-endpoint-arn.js";
import { SimSnsQueueEndpointArn } from "./sim-sns-queue-endpoint-arn.js";
import {
  simSnsLambdaProtocol,
  simSnsSmsProtocol,
  simSnsSqsProtocol,
  type SimSnsSubscriptionProtocol,
} from "./sim-sns-subscription-protocol.js";

/**
 * Where a subscription delivers, whichever kind of endpoint its protocol
 * implies.
 *
 * The Account and Region are there for a protocol whose endpoint is an ARN,
 * because a delivery resolves the endpoint in the scope that ARN gives rather
 * than in the topic's. An `sms` endpoint is a phone number and names neither,
 * which is why both are optional. What kind of resource an endpoint is belongs
 * to the protocol's own endpoint type.
 */
export interface SimSnsSubscriptionEndpoint {
  readonly value: string;
  readonly regionName?: AwsRegionName;
  readonly accountId?: SimAwsAccountId;
}

/**
 * Read the endpoint a Subscribe request names, for the protocol it named.
 *
 * The protocol decides what the endpoint has to be, so an SQS queue ARN over
 * the `lambda` protocol is refused here rather than at delivery time. Real SNS
 * validates the endpoint against the protocol at `Subscribe` time too, which is
 * where a phone number outside E.164 is refused.
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
    case simSnsSmsProtocol: {
      return SimSnsPhoneNumber.of(endpoint);
    }
  }
}
