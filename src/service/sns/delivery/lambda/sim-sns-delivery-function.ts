import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import { SimSnsDeliveryNotPermitted } from "../../error/sim-sns-delivery.error.js";
import { SimSnsNotFoundException } from "../../error/sim-sns.error.js";
import type { SimSnsFunctionEndpointArn } from "../../subscription/sim-sns-function-endpoint-arn.js";
import {
  type SimSnsDeliveryRequest,
  simSnsDeliverySource,
  simSnsServicePrincipal,
} from "../sim-sns-delivery.js";
import { simSnsLambdaEventDocument } from "./sim-sns-lambda-event.js";
import { simScopeIamAuthZ } from "../../../iam/authorize/sim-iam-region-auth-z.js";

interface SimSnsDeliveryFunctionProperties {
  readonly arn: SimSnsFunctionEndpointArn;
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * One function a simulated topic is delivering to, in the Account and Region
 * its ARN names.
 *
 * Everything is asked of the function's own Account, which is what makes a
 * function in another Account reachable: its resource policy is the grant, and
 * its Account's IAM is what evaluates it.
 */
export class SimSnsDeliveryFunction {
  private readonly arn: SimSnsFunctionEndpointArn;
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimSnsDeliveryFunctionProperties) {
    this.arn = properties.arn;
    this.scope = properties.scope;
  }

  /**
   * Invoke the function with the event, if it still admits SNS for this topic.
   *
   * The function, and the version or alias a qualified endpoint named, are
   * resolved on every delivery, along with the resource policy, so a
   * permission taken away afterwards stops delivery and an alias moved to
   * another version moves what runs. Real SNS checks none of it at
   * `Subscribe` time, which is why this is the only place it is asked.
   */
  async deliver(request: SimSnsDeliveryRequest): Promise<void> {
    const source = simSnsDeliverySource(request);
    const endpointArn = request.subscription.endpoint.value;
    const target = this.scope
      .lambda()
      .getSimFunctionTarget(this.arn.functionName, this.arn.qualifier);

    if (target === undefined) {
      // Not a refusal: the resource policy said nothing, because there is no
      // function. A subscription pointing at nothing is a mistake worth
      // warning about, where a policy saying no is a modelled outcome a test
      // may be asking for on purpose. A qualified endpoint reaches here for a
      // version or alias that is not there as well.
      throw new SimSnsNotFoundException(
        this.arn.qualifier === undefined
          ? `${endpointArn} is not a simulated Lambda function.`
          : `${endpointArn} names no simulated Lambda function version or ` +
              "alias.",
      );
    }

    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: simScopeIamAuthZ(this.scope),
    }).authorize({
      resource: target.resource,
      servicePrincipal: simSnsServicePrincipal,
      ...source,
    });

    if (decision.isDenied) {
      throw new SimSnsDeliveryNotPermitted(
        `The resource policy of ${endpointArn} does not allow ` +
          `${simSnsServicePrincipal} to invoke it for ${source.sourceArn}. ` +
          "Grant it with AddPermission.",
      );
    }

    // The function is invoked directly rather than through an Invoke command,
    // because SNS is already inside the background task that stands for the
    // asynchronous invocation real SNS makes, and because a handler failure
    // has to reach the delivery outcome rather than being swallowed as an
    // asynchronous invocation error.
    await target.simFunction.invoke(simSnsLambdaEventDocument(request));
  }
}
