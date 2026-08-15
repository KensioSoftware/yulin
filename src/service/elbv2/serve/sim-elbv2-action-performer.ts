import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import type { SimElbV2 } from "../sim-elbv2.js";
import { SimElbV2FixedResponse } from "./sim-elbv2-fixed-response.js";
import { SimElbV2ForwardTarget } from "./sim-elbv2-forward-target.js";
import type { SimElbV2TargetInvocations } from "./sim-elbv2-target-invocations.js";
import { SimElbV2RedirectResponse } from "./sim-elbv2-redirect-response.js";
import type { SimElbV2MatchedAction } from "./sim-elbv2-rule-evaluation.js";

interface SimElbV2PerformedActionInput {
  readonly matched: SimElbV2MatchedAction;
  readonly listener: SimElbV2Listener;
  readonly elbV2: SimElbV2;
  readonly request: Request;
}

/**
 * Carries out the action a listener or a rule answers a request with.
 *
 * Two of the three need no target at all: a fixed response and a redirect are
 * written by the load balancer itself, which is why a listener holding one can
 * serve with nothing registered behind it. A forward is the one that goes on to
 * a target group.
 */
export class SimElbV2ActionPerformer {
  private readonly fixedResponse = new SimElbV2FixedResponse();
  private readonly redirect = new SimElbV2RedirectResponse();

  constructor(private readonly invocations: SimElbV2TargetInvocations) {}

  /**
   * Answer one request with one matched action.
   */
  async perform(input: SimElbV2PerformedActionInput): Promise<Response> {
    const { action } = input.matched;

    if (action.type === "fixed-response") {
      return this.fixedResponse.respond(action);
    }

    if (action.type === "redirect") {
      return this.redirect.respond({
        action,
        listener: input.listener,
        request: input.request,
      });
    }

    return await this.forward(input);
  }

  private async forward(
    input: SimElbV2PerformedActionInput,
  ): Promise<Response> {
    return await this.invocations.invoke({
      listener: input.listener,
      targetGroup: new SimElbV2ForwardTarget(input.elbV2).resolve(
        input.matched,
      ),
      request: input.request,
    });
  }
}
