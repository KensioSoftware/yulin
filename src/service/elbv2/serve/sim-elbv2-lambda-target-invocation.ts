import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2TargetGroup } from "../target-group/sim-elbv2-target-group.js";
import { SimElbV2ErrorResponse } from "./sim-elbv2-error-response.js";
import { SimElbV2EventBuilder } from "./sim-elbv2-event-builder.js";
import { SimElbV2InvokeAuthorizer } from "./sim-elbv2-invoke-authorizer.js";
import { SimElbV2ResponseBuilder } from "./sim-elbv2-response-builder.js";
import type {
  SimElbV2FunctionTarget,
  SimElbV2Router,
} from "./sim-elbv2-router.js";

/**
 * The largest request body real ELB sends to a Lambda target.
 */
const maximumRequestBytes = 1024 * 1024;

interface SimElbV2LambdaTargetInvocationProperties {
  readonly router: SimElbV2Router;
  /** Clock the invocation event is stamped with. */
  readonly clock: SimClock;
}

interface SimElbV2LambdaTargetInvocationInput {
  readonly loadBalancer: SimElbV2LoadBalancer;
  readonly listener: SimElbV2Listener;
  readonly targetGroup: SimElbV2TargetGroup;
  readonly request: Request;
}

/**
 * Invokes the Lambda function registered in a target group, and turns what it
 * returns into the HTTP response.
 *
 * A target group with nothing in it is a 503, because there is no target to
 * send the request to. Everything that goes wrong once there is one is a 502:
 * a function that is not there, one the load balancer may not invoke, one that
 * threw, and one whose result is not a response. That is what real ELB does
 * too, and it is why the load balancer's own logs are the only place the
 * difference between them shows.
 */
export class SimElbV2LambdaTargetInvocation {
  private readonly router: SimElbV2Router;
  private readonly eventBuilder: SimElbV2EventBuilder;
  private readonly responseBuilder = new SimElbV2ResponseBuilder();
  private readonly errorResponse = new SimElbV2ErrorResponse();

  constructor(properties: SimElbV2LambdaTargetInvocationProperties) {
    this.router = properties.router;
    this.eventBuilder = new SimElbV2EventBuilder({
      clock: properties.clock,
    });
  }

  /**
   * Invoke the target group's function for one request.
   */
  async invoke(input: SimElbV2LambdaTargetInvocationInput): Promise<Response> {
    const { targetGroup } = input;

    if (targetGroup.registeredTargets.length === 0) {
      return this.errorResponse.serviceUnavailable();
    }

    const target = this.router.functionFor(targetGroup);

    if (target === undefined || this.mayNotInvoke(targetGroup, target)) {
      return this.errorResponse.badGateway();
    }

    return await this.run(input, target);
  }

  /**
   * Whether the load balancer lacks permission to invoke the function.
   */
  private mayNotInvoke(
    targetGroup: SimElbV2TargetGroup,
    target: SimElbV2FunctionTarget,
  ): boolean {
    return new SimElbV2InvokeAuthorizer({ iam: target.iam }).authorize({
      simFunction: target.simFunction,
      targetGroup,
      accountId: targetGroup.accountRegionScope.accountId,
    }).isDenied;
  }

  private async run(
    input: SimElbV2LambdaTargetInvocationInput,
    target: SimElbV2FunctionTarget,
  ): Promise<Response> {
    const { loadBalancer, listener, targetGroup, request } = input;

    try {
      const bytes = new Uint8Array(await request.arrayBuffer());

      if (bytes.length > maximumRequestBytes) {
        return this.errorResponse.payloadTooLarge();
      }

      const event = this.eventBuilder.build({
        request,
        bytes,
        targetGroupArn: targetGroup.arn,
        dnsName: loadBalancer.dnsName,
        port: listener.port,
        protocol: listener.protocol,
      });

      return this.responseBuilder.build(await target.simFunction.invoke(event));
    } catch {
      // A handler that threw is a 502 with the error only in the function's
      // own logs, as it is on real ELB. Reading the request body can fail the
      // same way, so building the event is inside this too.
      return this.errorResponse.badGateway();
    }
  }
}
