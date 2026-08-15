import type { SimClock } from "../../../util/clock/sim-clock.js";
import { SimElbV2ContainerTargetInvocation } from "./sim-elbv2-container-target-invocation.js";
import { SimElbV2LambdaTargetInvocation } from "./sim-elbv2-lambda-target-invocation.js";
import type { SimElbV2Router } from "./sim-elbv2-router.js";
import type { SimElbV2TargetInvocationInput } from "./sim-elbv2-target-invocation.js";

interface SimElbV2TargetInvocationsProperties {
  readonly router: SimElbV2Router;
  readonly clock: SimClock;
}

/**
 * The target type whose targets are invoked as functions.
 */
const lambdaTargetType = "lambda";

/**
 * Sends a request to a target group by what the group holds.
 *
 * The two simulated target types are reached in entirely different ways, and
 * the target type is the only thing that decides which: a `lambda` group holds
 * a function to invoke, and an `ip` group holds the addresses of an ECS
 * service's tasks, whose bound container answers the request itself. Nothing
 * else in the serving path branches on it.
 */
export class SimElbV2TargetInvocations {
  private readonly lambda: SimElbV2LambdaTargetInvocation;
  private readonly container: SimElbV2ContainerTargetInvocation;

  constructor(properties: SimElbV2TargetInvocationsProperties) {
    this.lambda = new SimElbV2LambdaTargetInvocation(properties);
    this.container = new SimElbV2ContainerTargetInvocation(properties);
  }

  /**
   * Send one request to whatever the target group holds.
   */
  async invoke(input: SimElbV2TargetInvocationInput): Promise<Response> {
    if (input.targetGroup.targetType.value === lambdaTargetType) {
      return await this.lambda.invoke(input);
    }

    return await this.container.invoke(input);
  }
}
