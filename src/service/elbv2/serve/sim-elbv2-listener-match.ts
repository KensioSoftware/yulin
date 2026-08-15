import { SimElbV2ConnectionRefusedError } from "../error/sim-elbv2.error.js";
import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import { simElbV2RequestPort } from "./sim-elbv2-request-port.js";
import type { SimElbV2LoadBalancerRoute } from "./sim-elbv2-router.js";

/**
 * Find the listener answering the port a request arrived on, or refuse.
 *
 * A port no listener holds throws rather than answering, because on real AWS
 * the connection is refused and there is no status to send back.
 */
export function requireSimElbV2Listener(
  route: SimElbV2LoadBalancerRoute,
  request: Request,
): SimElbV2Listener {
  const { loadBalancer, elbV2 } = route;
  const port = simElbV2RequestPort(request);
  const listener = elbV2.findListenerOnPort(loadBalancer.arn, port);

  if (listener === undefined) {
    throw new SimElbV2ConnectionRefusedError(
      `Load balancer '${loadBalancer.name}' has no listener on port ${String(
        port,
      )}`,
    );
  }

  return listener;
}
