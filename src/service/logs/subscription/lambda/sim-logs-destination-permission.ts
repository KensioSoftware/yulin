import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimLambdaFunction } from "../../../lambda/function/sim-lambda-function.js";
import { SimLogsDeliveryNotPermitted } from "../../error/sim-logs-delivery.error.js";
import { SimLogsResourceNotFoundException } from "../../error/sim-logs.error.js";

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
 * The resource policy is consulted on every delivery rather than remembered
 * from when the filter was put, so a permission taken away afterwards stops
 * delivery, as it does in an account.
 */
export function permittedSimLogsDestinationFunction(
  destinationArn: string,
  functionName: string,
  scope: SimAwsAccountRegionContainer,
): SimLambdaFunction {
  const simFunction = scope.lambda().getSimFunctionByName(functionName);

  if (simFunction === undefined) {
    throw new SimLogsResourceNotFoundException(
      `${destinationArn} is not a simulated Lambda function.`,
    );
  }

  const servicePrincipal = simLogsServicePrincipal(scope.region.regionName);
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
