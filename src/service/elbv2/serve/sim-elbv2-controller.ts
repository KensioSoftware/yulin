import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimElbV2ConnectionRefusedError } from "../error/sim-elbv2.error.js";
import { SimElbV2ActionPerformer } from "./sim-elbv2-action-performer.js";
import { SimElbV2LambdaTargetInvocation } from "./sim-elbv2-lambda-target-invocation.js";
import { requireSimElbV2Listener } from "./sim-elbv2-listener-match.js";
import {
  type SimElbV2LoadBalancerRoute,
  SimElbV2Router,
} from "./sim-elbv2-router.js";
import { SimElbV2RuleEvaluation } from "./sim-elbv2-rule-evaluation.js";

interface SimElbV2ServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimElbV2Router;
}

/**
 * HTTP controller for simulated Application Load Balancers.
 *
 * A request reaching a load balancer's DNS name is matched to a listener by the
 * port it arrived on. That listener's rules are then evaluated in priority
 * order, and the first one claiming the request says what happens to it. A
 * request no rule claims is answered by the listener's default action.
 */
export class SimElbV2ServiceController implements SimAwsServiceController {
  private readonly router: SimElbV2Router;
  private readonly actions: SimElbV2ActionPerformer;

  constructor(properties: SimElbV2ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimElbV2Router({ simAws });
    // The clock is taken from the router rather than from properties, so a
    // supplied router and the event timestamps belong to the same simulation.
    this.actions = new SimElbV2ActionPerformer(
      new SimElbV2LambdaTargetInvocation({
        router: this.router,
        clock: this.router.simAws,
      }),
    );
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

    return await this.answer(route, serviceRequest.request);
  }

  private async answer(
    route: SimElbV2LoadBalancerRoute,
    request: Request,
  ): Promise<Response> {
    const { loadBalancer, elbV2 } = route;
    const listener = requireSimElbV2Listener(route, request);

    return await this.actions.perform({
      matched: new SimElbV2RuleEvaluation(elbV2).actionFor(listener, request),
      loadBalancer,
      listener,
      elbV2,
      request,
    });
  }
}
