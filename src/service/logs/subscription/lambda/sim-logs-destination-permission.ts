import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimLambdaFunctionTarget } from "../../../lambda/function/version/sim-lambda-function-target.js";
import { SimLogsDeliveryNotPermitted } from "../../error/sim-logs-delivery.error.js";
import { SimLogsResourceNotFoundException } from "../../error/sim-logs.error.js";
import type { SimLogsSubscriptionFunctionArn } from "./sim-logs-subscription-function-arn.js";
import { simScopeIamAuthZ } from "../../../iam/authorize/sim-iam-region-auth-z.js";

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

/**
 * The destination function, refusing one that is missing or does not admit
 * CloudWatch Logs.
 *
 * The function and the resource policy are both resolved on every delivery
 * rather than remembered from when the filter was put, so a permission taken
 * away afterwards stops delivery, as it does in an account, and an alias moved
 * to another version moves what runs.
 */
export function permittedSimLogsDestinationFunction(
  arn: SimLogsSubscriptionFunctionArn,
  scope: SimAwsAccountRegionContainer,
): SimLambdaFunctionTarget {
  const destinationArn = arn.value;
  const target = scope
    .lambda()
    .getSimFunctionTarget(arn.functionName, arn.qualifier);

  if (target === undefined) {
    throw new SimLogsResourceNotFoundException(
      arn.qualifier === undefined
        ? `${destinationArn} is not a simulated Lambda function.`
        : `${destinationArn} names no simulated Lambda function version or alias.`,
    );
  }

  const servicePrincipal = simLogsServicePrincipal(scope.region.regionName);
  const decision = new SimLambdaServiceInvokeAuthorizer({
    iam: simScopeIamAuthZ(scope),
  }).authorize({ resource: target.resource, servicePrincipal });

  if (decision.isDenied) {
    throw new SimLogsDeliveryNotPermitted(
      `Could not execute the lambda function. Make sure you have given ` +
        `CloudWatch Logs permission to execute your function: the resource ` +
        `policy of ${destinationArn} does not allow ${servicePrincipal} to ` +
        `invoke it. Grant it with AddPermission.`,
    );
  }

  return target;
}
