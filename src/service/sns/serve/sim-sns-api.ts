import type { SimAws } from "../../aws/sim-aws.js";
import { SimQueryApiEndpoint } from "../../../serve/http/api/query/sim-query-endpoint.js";
import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import { simSnsQueryPublishOperations } from "./sim-sns-query-publish-operations.js";
import { simSnsQuerySmsOperations } from "./sim-sns-query-sms-operations.js";
import { simSnsQuerySubscriptionOperations } from "./sim-sns-query-subscription-operations.js";
import { simSnsQueryTopicOperations } from "./sim-sns-query-topic-operations.js";

/**
 * The XML namespace real SNS stamps on every response it sends.
 */
const snsNamespace = "https://sns.amazonaws.com/doc/2010-03-31/";

/**
 * Serve the SNS Query API to a client given an endpoint URL.
 *
 * This is what a container or a non-Node application reaches. Publishing to a
 * simulated topic over HTTP delivers to the simulated Queues and Functions
 * subscribed to it, exactly as an in-process publish does.
 *
 * The operations served are the ones simulated SNS implements. Anything else
 * is refused as `NotImplemented`, under that name rather than as an
 * unparseable response.
 */
export function simSnsApiEndpoint(simAws: SimAws): SimQueryApiEndpoint {
  return new SimQueryApiEndpoint({
    simAws,
    serviceId: "SNS",
    namespace: snsNamespace,
    operations: simSnsQueryOperations(),
  });
}

function simSnsQueryOperations(): SimQueryOperations {
  return new Map([
    ...simSnsQueryTopicOperations(),
    ...simSnsQuerySubscriptionOperations(),
    ...simSnsQueryPublishOperations(),
    ...simSnsQuerySmsOperations(),
  ]);
}
