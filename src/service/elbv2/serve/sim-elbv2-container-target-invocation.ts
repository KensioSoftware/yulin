import type { SimClock } from "../../../util/clock/sim-clock.js";
import { SimElbV2ErrorResponse } from "./sim-elbv2-error-response.js";
import { SimElbV2ForwardedRequest } from "./sim-elbv2-forwarded-request.js";
import type { SimElbV2Router } from "./sim-elbv2-router.js";
import type {
  SimElbV2TargetInvocation,
  SimElbV2TargetInvocationInput,
} from "./sim-elbv2-target-invocation.js";

interface SimElbV2ContainerTargetInvocationProperties {
  readonly router: SimElbV2Router;
  /** Clock the forwarded request's trace id is stamped with. */
  readonly clock: SimClock;
}

/**
 * Carries a request to the container of the simulated ECS service registered
 * into an address target group.
 *
 * There are three ways for this to have nothing to send the request to, and all
 * three are the same 503 real ELB answers when no target is in service. A group
 * with nothing registered has no target at all. A group whose registered
 * service has no container bound to an HTTP handler has a target with nothing
 * behind it, which is what a real load balancer sees when a task's container is
 * not answering. An address registered by hand is the same case: nothing in
 * this simulation listens on an address, so only a service registration puts
 * something behind one.
 *
 * A container that throws is a 502, as a Lambda target that throws is. The
 * error goes no further than the load balancer, which is also where it goes on
 * real AWS: what the client sees is the status.
 */
export class SimElbV2ContainerTargetInvocation implements SimElbV2TargetInvocation {
  private readonly router: SimElbV2Router;
  private readonly forwardedRequest: SimElbV2ForwardedRequest;
  private readonly errorResponse = new SimElbV2ErrorResponse();

  constructor(properties: SimElbV2ContainerTargetInvocationProperties) {
    this.router = properties.router;
    this.forwardedRequest = new SimElbV2ForwardedRequest({
      clock: properties.clock,
    });
  }

  /**
   * Send one request to the target group's container.
   */
  async invoke(input: SimElbV2TargetInvocationInput): Promise<Response> {
    const { targetGroup } = input;

    if (targetGroup.registeredTargets.length === 0) {
      return this.errorResponse.serviceUnavailable();
    }

    const container = this.router.containerFor(targetGroup);

    if (container === undefined) {
      return this.errorResponse.serviceUnavailable();
    }

    try {
      return this.answered(
        await container.handle(this.forwardedRequest.build(input)),
      );
    } catch {
      return this.errorResponse.badGateway();
    }
  }

  /**
   * What the container answered, where it answered with a response at all.
   *
   * A handler that returns something else is the same 502 a Lambda target's
   * unusable result is. The binding's type says a response, so this is for a
   * handler written in JavaScript, where nothing checked.
   */
  private answered(answer: Response): Response {
    if (answer instanceof Response) {
      return answer;
    }

    return this.errorResponse.badGateway();
  }
}
