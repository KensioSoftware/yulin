import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimLambdaFunction } from "../../../lambda/function/sim-lambda-function.js";
import {
  parseSimLambdaFunctionArn,
  type SimLambdaFunctionArnParts,
} from "../../../lambda/function/sim-lambda-function-arn-parts.js";
import type {
  SimCognitoTriggerFunctionRequest,
  SimCognitoTriggerFunctions,
} from "./sim-cognito-trigger-functions.js";

/**
 * The service principal real Cognito invokes a user pool trigger as.
 */
export const simCognitoServicePrincipal = "cognito-idp.amazonaws.com";

interface SimAwsCognitoTriggerFunctionsProperties {
  readonly simAws: SimAws;
}

/**
 * The Lambda functions a simulated user pool's triggers can reach.
 *
 * A `LambdaConfig` names a function by ARN, and that ARN can name any Account
 * and Region, so the functions come from the whole simulation rather than from
 * the scope the pool belongs to.
 */
export function simAwsCognitoTriggerFunctions(
  simAws: SimAws,
): SimCognitoTriggerFunctions {
  return new SimAwsCognitoTriggerFunctions({ simAws });
}

/**
 * The simulated Lambda functions of one simulated AWS instance, as user pool
 * trigger targets.
 *
 * Functions are looked up when a trigger fires, never when a pool is created,
 * so a pool can be created before the function it names and one deleted
 * afterwards refuses the sign-in rather than having silently broken the pool.
 * That also keeps CloudFormation free to deploy the two in either order.
 */
export class SimAwsCognitoTriggerFunctions implements SimCognitoTriggerFunctions {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsCognitoTriggerFunctionsProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Why the pool may not invoke the function, or nothing when it may.
   *
   * Whether a service may invoke a function is Lambda's own rule, so the
   * decision is made there. What Cognito adds is which pool is calling, supplied
   * as the source ARN and source Account, so a permission granted for one pool
   * does not open the function to another.
   */
  invokeRefusal(request: SimCognitoTriggerFunctionRequest): string | undefined {
    const arn = parseSimLambdaFunctionArn(request.functionArn);

    if (arn === undefined) {
      return `${request.functionArn} is not a Lambda function ARN.`;
    }

    if (arn.qualifier !== undefined) {
      return (
        `${request.functionArn} names a function version or alias, and ` +
        "simulated Lambda has neither, so it is refused rather than treated " +
        "as the unqualified function."
      );
    }

    const simFunction = this.findFunction(arn);

    if (simFunction === undefined) {
      return `${request.functionArn} is not a simulated Lambda function.`;
    }

    return this.policyRefusal(simFunction, request);
  }

  /**
   * Invoke the function with the trigger event, answering with what the
   * handler returned.
   *
   * The function is invoked directly rather than through an Invoke command,
   * because real Cognito invokes it as the service rather than as the caller
   * signing in, and because the handler's return value and its failure both
   * have to reach the sign-in rather than being reported as an invocation
   * result.
   */
  async invoke(
    request: SimCognitoTriggerFunctionRequest,
    event: object,
  ): Promise<unknown> {
    const arn = parseSimLambdaFunctionArn(request.functionArn);
    const simFunction = arn === undefined ? undefined : this.findFunction(arn);

    // eslint-disable-next-line no-restricted-syntax -- `assertDefined` is denser per line, and this file is close enough to the FTA threshold that the guard costs less kept as it is
    if (simFunction === undefined) {
      throw new Error(
        `${request.functionArn} is not a simulated Lambda function.`,
      );
    }

    return await simFunction.invoke(event);
  }

  private policyRefusal(
    simFunction: SimLambdaFunction,
    request: SimCognitoTriggerFunctionRequest,
  ): string | undefined {
    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: this.iam(simFunction),
    }).authorize({
      simFunction,
      servicePrincipal: simCognitoServicePrincipal,
      sourceArn: request.userPoolArn,
      sourceAccount: request.userPoolAccountId,
    });

    if (decision.isDenied) {
      return (
        `The resource policy of ${request.functionArn} does not allow ` +
        `${simCognitoServicePrincipal} to invoke it for ` +
        `${request.userPoolArn}. Grant it with AddPermission, or with the ` +
        "AWS::Lambda::Permission a CDK addTrigger emits."
      );
    }

    return undefined;
  }

  private findFunction(
    arn: SimLambdaFunctionArnParts,
  ): SimLambdaFunction | undefined {
    return this.simAws
      .accountRegionScope(arn.accountId, arn.regionName)
      .lambda()
      .getSimFunctionByName(arn.functionName);
  }

  private iam(simFunction: SimLambdaFunction): SimIamInterServiceAuthZ {
    const { accountId, regionName } = simFunction.accountRegionScope;

    return this.simAws.accountRegionScope(accountId, regionName).iam();
  }
}
