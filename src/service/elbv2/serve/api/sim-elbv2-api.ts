import type { SimAws } from "../../../aws/sim-aws.js";
import { SimQueryApiEndpoint } from "../../../../serve/http/api/query/sim-query-endpoint.js";
import type { SimQueryOperations } from "../../../../serve/http/api/query/sim-query-operation.js";
import { simElbV2QueryListenerCertificateOperations } from "./sim-elbv2-query-listener-certificate-operations.js";
import { simElbV2QueryListenerOperations } from "./sim-elbv2-query-listener-operations.js";
import { simElbV2QueryLoadBalancerOperations } from "./sim-elbv2-query-load-balancer-operations.js";
import { simElbV2QueryRuleOperations } from "./sim-elbv2-query-rule-operations.js";
import { simElbV2QueryTargetGroupOperations } from "./sim-elbv2-query-target-group-operations.js";
import { simElbV2QueryTargetOperations } from "./sim-elbv2-query-target-operations.js";

/**
 * The XML namespace real ELBv2 stamps on every response it sends.
 */
const elbV2Namespace =
  "http://elasticloadbalancing.amazonaws.com/doc/2015-12-01/";

/**
 * Serve the ELBv2 Query API to a client given an endpoint URL.
 *
 * A load balancer built over the endpoint answers requests the same way one
 * built in process does, so a container that provisions its own routing and
 * then calls through it reaches the same simulated functions.
 *
 * The operations served are the ones simulated ELBv2 implements. Anything else
 * is refused as `NotImplemented`, under that name rather than as an
 * unparseable response.
 */
export function simElbV2ApiEndpoint(simAws: SimAws): SimQueryApiEndpoint {
  return new SimQueryApiEndpoint({
    simAws,
    serviceId: "Elastic Load Balancing v2",
    namespace: elbV2Namespace,
    operations: simElbV2QueryOperations(),
  });
}

function simElbV2QueryOperations(): SimQueryOperations {
  return new Map([
    ...simElbV2QueryLoadBalancerOperations(),
    ...simElbV2QueryTargetGroupOperations(),
    ...simElbV2QueryTargetOperations(),
    ...simElbV2QueryListenerOperations(),
    ...simElbV2QueryListenerCertificateOperations(),
    ...simElbV2QueryRuleOperations(),
  ]);
}
