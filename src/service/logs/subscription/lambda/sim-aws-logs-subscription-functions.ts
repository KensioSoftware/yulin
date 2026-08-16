import type { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimLambdaFunction } from "../../../lambda/function/sim-lambda-function.js";
import { SimLogsResourceNotFoundException } from "../../error/sim-logs.error.js";
import { SimLogsDeliveryNotPermitted } from "../../error/sim-logs-delivery.error.js";
import type { SimLogsSubscriptionDestinations } from "../sim-logs-subscription-destinations.js";
import {
  simLogsSubscriptionEventPayload,
  type SimLogsSubscriptionDelivery,
} from "../sim-logs-subscription-event.js";
import { SimLogsSubscriptionFunctionArn } from "./sim-logs-subscription-function-arn.js";

/**
 * The service principal CloudWatch Logs invokes a destination function as.
 *
 * Real CloudWatch Logs uses the regional form, `logs.<region>.amazonaws.com`,
 * which is why a working `AddPermission` for a subscription filter names that
 * rather than the plain `logs.amazonaws.com` most services use.
 */
export function simLogsServicePrincipal(regionName: string): string {
  return `logs.${regionName}.amazonaws.com`;
}

interface SimAwsLogsSubscriptionFunctionsProperties {
  readonly simAws: SimAws;
}

/**
 * The simulated Lambda functions of one simulated AWS instance, as places a
 * subscription filter delivers to.
 *
 * The function is looked up when an event is delivered, and again when a
 * filter is put, never when this is built: reaching simulated Lambda while
 * simulated CloudWatch Logs is being constructed would be a cycle with no
 * bottom to it, since every Lambda function records its output here.
 */
export class SimAwsLogsSubscriptionFunctions implements SimLogsSubscriptionDestinations {
  readonly #simAws: SimAws;

  constructor(properties: SimAwsLogsSubscriptionFunctionsProperties) {
    this.#simAws = properties.simAws;
  }

  /**
   * Check the destination function is there and admits CloudWatch Logs.
   */
  check(destinationArn: string): Promise<void> {
    this.permittedFunction(destinationArn);

    return Promise.resolve();
  }

  /**
   * Deliver matched events to the destination function.
   */
  async deliver(
    destinationArn: string,
    delivery: SimLogsSubscriptionDelivery,
  ): Promise<void> {
    const simFunction = this.permittedFunction(destinationArn);

    // Invoked directly rather than through an Invoke command, because this is
    // already inside the background task that stands for the asynchronous
    // delivery real CloudWatch Logs makes, and because a handler failure has
    // to reach the delivery outcome rather than being swallowed.
    await simFunction.invoke(simLogsSubscriptionEventPayload(delivery));
  }

  /**
   * The destination function, refusing one that is missing or does not admit
   * CloudWatch Logs.
   *
   * The resource policy is consulted on every delivery rather than remembered
   * from when the filter was put, so a permission taken away afterwards stops
   * delivery, as it does in an account.
   */
  private permittedFunction(destinationArn: string): SimLambdaFunction {
    const arn = SimLogsSubscriptionFunctionArn.parse(destinationArn);
    const scope = this.#simAws.accountRegionScope(
      arn.accountId,
      arn.regionName,
    );
    const simFunction = scope.lambda().getSimFunctionByName(arn.functionName);

    if (simFunction === undefined) {
      throw new SimLogsResourceNotFoundException(
        `${destinationArn} is not a simulated Lambda function.`,
      );
    }

    const servicePrincipal = simLogsServicePrincipal(arn.regionName);
    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: scope.iam(),
    }).authorize({ simFunction, servicePrincipal });

    if (decision.isDenied) {
      throw new SimLogsDeliveryNotPermitted(
        `Could not execute the lambda function. Make sure you have given ` +
          `CloudWatch Logs permission to execute your function: the resource ` +
          `policy of ${destinationArn} does not allow ${servicePrincipal} to ` +
          `invoke it. Grant it with AddPermission.`,
      );
    }

    return simFunction;
  }
}
