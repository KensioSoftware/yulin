import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import {
  SimEventBridgeDeliveryNotPermitted,
  SimEventBridgeTargetNotFound,
} from "../error/sim-event-bridge-delivery.error.js";
import {
  type SimEventBridgeDeliveryRequest,
  simEventBridgeDeliveryDocument,
  simEventBridgeDeliverySource,
  simEventBridgeServicePrincipal,
} from "./sim-event-bridge-delivery.js";

interface SimEventBridgeDeliveryFunctionProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * A Lambda function a simulated rule is sending an event to, in the Account
 * and Region the target ARN names.
 *
 * Everything is asked of the function's own Account, which is what makes a
 * function in another Account reachable: its resource policy is the grant, and
 * its Account's IAM is what evaluates it.
 */
export class SimEventBridgeDeliveryFunction {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimEventBridgeDeliveryFunctionProperties) {
    this.scope = properties.scope;
  }

  /**
   * Invoke the function with the event, if it admits EventBridge for this
   * rule.
   *
   * The resource policy is consulted on every delivery rather than remembered
   * from the moment the target was added, so a permission taken away
   * afterwards stops delivery. Real EventBridge does not check it at
   * `PutTargets` time either.
   */
  async deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    const source = simEventBridgeDeliverySource(request);
    const targetArn = request.target.arn;
    const simFunction = this.scope
      .lambda()
      .getSimFunctionByName(targetArn.functionName);

    if (simFunction === undefined) {
      throw new SimEventBridgeTargetNotFound(
        `${targetArn.value} is not a simulated Lambda function.`,
      );
    }

    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: this.scope.iam(),
    }).authorize({
      simFunction,
      servicePrincipal: simEventBridgeServicePrincipal,
      ...source,
    });

    if (decision.isDenied) {
      throw new SimEventBridgeDeliveryNotPermitted(
        `The resource policy of ${targetArn.value} does not allow ` +
          `${simEventBridgeServicePrincipal} to invoke it for ` +
          `${source.sourceArn}. Grant it with AddPermission.`,
      );
    }

    // Invoked directly rather than through an Invoke command, because the
    // rule is already inside the background task that stands for the
    // asynchronous invocation real EventBridge makes, and because a handler
    // failure has to reach the delivery outcome rather than being swallowed
    // as an asynchronous invocation error.
    await simFunction.invoke(simEventBridgeDeliveryDocument(request));
  }
}
