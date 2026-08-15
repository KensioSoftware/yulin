import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimElbV2ConnectionRefusedError } from "../error/sim-elbv2.error.js";
import { SimElbV2ForwardTarget } from "./sim-elbv2-forward-target.js";
import { SimElbV2LambdaTargetInvocation } from "./sim-elbv2-lambda-target-invocation.js";
import { simElbV2RequestPort } from "./sim-elbv2-request-port.js";
import {
  type SimElbV2LoadBalancerRoute,
  SimElbV2Router,
} from "./sim-elbv2-router.js";

interface SimElbV2ServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimElbV2Router;
}

/**
 * HTTP controller for simulated Application Load Balancers.
 *
 * A request reaching a load balancer's DNS name is matched to a listener by the
 * port it arrived on, and the listener's default action decides what happens
 * next. A forward action sends it to a target group, and a lambda target group
 * invokes the function registered in it with an ALB event.
 *
 * Nothing here matches listener rules yet, so every request a listener takes is
 * answered by its default action.
 */
export class SimElbV2ServiceController implements SimAwsServiceController {
  private readonly router: SimElbV2Router;
  private readonly invocation: SimElbV2LambdaTargetInvocation;

  constructor(properties: SimElbV2ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimElbV2Router({ simAws });
    // The clock is taken from the router rather than from properties, so a
    // supplied router and the event timestamps belong to the same simulation.
    this.invocation = new SimElbV2LambdaTargetInvocation({
      router: this.router,
      clock: this.router.simAws,
    });
  }

  /**
   * Handle an HTTP request routed to a simulated load balancer.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    const route = this.router.route(serviceRequest.target);

    if (route === undefined) {
      throw new SimElbV2ConnectionRefusedError(
        `No simulated load balancer answers on ` +
          `'${serviceRequest.target.resourceName}'`,
      );
    }

    return await this.forward(route, serviceRequest.request);
  }

  private async forward(
    route: SimElbV2LoadBalancerRoute,
    request: Request,
  ): Promise<Response> {
    const { loadBalancer, elbV2 } = route;
    const port = simElbV2RequestPort(new URL(request.url));
    const listener = elbV2.findListenerOnPort(loadBalancer.arn, port);

    if (listener === undefined) {
      throw new SimElbV2ConnectionRefusedError(
        `Load balancer '${loadBalancer.name}' has no listener on port ${String(
          port,
        )}`,
      );
    }

    return await this.invocation.invoke({
      loadBalancer,
      listener,
      targetGroup: new SimElbV2ForwardTarget(elbV2).resolve(listener),
      request,
    });
  }
}
