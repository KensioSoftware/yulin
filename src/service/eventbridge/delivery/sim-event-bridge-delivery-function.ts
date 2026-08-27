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
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";

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
   * The function, the version or alias a qualified target named, and the
   * resource policy are all resolved on every delivery rather than remembered
   * from the moment the target was added, so a permission taken away
   * afterwards stops delivery and an alias moved to another version moves what
   * runs. Real EventBridge does not check any of it at `PutTargets` time
   * either.
   */
  async deliver(request: SimEventBridgeDeliveryRequest): Promise<void> {
    const source = simEventBridgeDeliverySource(request);
    const targetArn = request.target.arn;
    const target = this.scope
      .lambda()
      .getSimFunctionTarget(
        targetArn.functionName,
        targetArn.functionQualifier,
      );

    if (target === undefined) {
      throw new SimEventBridgeTargetNotFound(
        targetArn.functionQualifier === undefined
          ? `${targetArn.value} is not a simulated Lambda function.`
          : `${targetArn.value} names no simulated Lambda function version ` +
              "or alias.",
      );
    }

    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: simScopeIamAuthZ(this.scope),
    }).authorize({
      resource: target.resource,
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
    await target.simFunction.invoke(simEventBridgeDeliveryDocument(request));
  }
}
