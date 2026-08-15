import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import type { SimElbV2TargetGroup } from "../target-group/sim-elbv2-target-group.js";

/**
 * One request, and the configuration that sent it to a target group.
 */
export interface SimElbV2TargetInvocationInput {
  readonly listener: SimElbV2Listener;
  readonly targetGroup: SimElbV2TargetGroup;
  readonly request: Request;
}

/**
 * What carries a request from a target group to whatever is registered in it.
 *
 * There is one of these per kind of target, because the two kinds have nothing
 * in common past this point: a function is invoked with an event and answers
 * with a result, and a container is handed the request and answers with the
 * response. What they do share is which failures the load balancer answers for
 * itself, and both of them answer those the same way.
 */
export interface SimElbV2TargetInvocation {
  invoke(input: SimElbV2TargetInvocationInput): Promise<Response>;
}
