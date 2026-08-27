import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSchedulerDeliveryNotPermitted,
  SimSchedulerTargetNotFound,
} from "../error/sim-scheduler-delivery.error.js";
import {
  type SimSchedulerAssumedDelivery,
  simSchedulerDeliveryDocument,
} from "./sim-scheduler-delivery.js";
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";

const invokeAction = "lambda:InvokeFunction";

interface SimSchedulerDeliveryFunctionProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * A Lambda function a simulated schedule invokes.
 *
 * The function's own resource policy is not consulted, which is the difference
 * from an EventBridge rule target: the schedule arrives as an assumed role
 * rather than as a service principal, and a role in the same Account needs only
 * its own identity policy to invoke a function.
 */
export class SimSchedulerDeliveryFunction {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimSchedulerDeliveryFunctionProperties) {
    this.scope = properties.scope;
  }

  /**
   * Invoke the function, if the execution role may.
   */
  async deliver(delivery: SimSchedulerAssumedDelivery): Promise<void> {
    const targetArn = delivery.request.schedule.target.arn;
    const simFunction = this.scope
      .lambda()
      .getSimFunctionByName(targetArn.functionName);

    if (simFunction === undefined) {
      throw new SimSchedulerTargetNotFound(
        `${targetArn.value} is not a simulated Lambda function.`,
      );
    }

    const decision = simScopeIamAuthZ(this.scope).authorize({
      action: invokeAction,
      resource: targetArn.value,
      caller: delivery.caller,
    });

    if (decision.isDenied) {
      throw new SimSchedulerDeliveryNotPermitted(
        `${delivery.request.schedule.target.roleArn} is not allowed to ` +
          `${invokeAction} on ${targetArn.value}. Grant it in a policy on ` +
          `the execution role.`,
      );
    }

    // Invoked directly rather than through an Invoke command, because the
    // schedule is already inside the background task standing for the
    // asynchronous invocation real Scheduler makes, and because a handler
    // failure has to reach the delivery outcome rather than being swallowed.
    await simFunction.invoke(simSchedulerDeliveryDocument(delivery.request));
  }
}
