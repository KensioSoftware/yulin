import type { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaFunctionTarget } from "../../lambda/function/version/sim-lambda-function-target.js";
import {
  assumeSimServiceRole,
  type SimServiceRoleRefusals,
  simServiceRoleTarget,
} from "../../sts/service-role/sim-service-role.js";
import { SimCloudFrontInvalidLambdaFunctionAssociation } from "../error/sim-cloudfront.error.js";
import { edgeFunctionArnParts } from "./sim-cf-edge-function-arn.js";
import type { SimCfEdgeFunctions } from "./sim-cf-edge-functions.js";
import { findSimCfEdgeFunctionVersion } from "./sim-cf-edge-function-version.js";

/**
 * The service principal Lambda@Edge runs a function's execution role as.
 *
 * A role for an ordinary function trusts `lambda.amazonaws.com` alone, and
 * CloudFront refuses to associate that function. Adding this principal to the
 * trust policy is the step people miss.
 */
export const simLambdaEdgeServicePrincipal = "edgelambda.amazonaws.com";

/**
 * The session name AWS gives a role Lambda@Edge assumes.
 */
const sessionName = "LambdaEdge";

/**
 * The simulated Lambda functions of one simulated AWS instance, as Lambda@Edge
 * targets.
 */
export class SimAwsCfEdgeFunctions implements SimCfEdgeFunctions {
  constructor(private readonly simAws: SimAws) {}

  /**
   * Check the function is there and that Lambda@Edge could run it.
   */
  async assertAssociable(functionArn: string): Promise<void> {
    await this.assertExecutionRoleTrust(this.target(functionArn), functionArn);
  }

  /**
   * Run the function for one edge event.
   *
   * The function is invoked directly rather than through an Invoke command,
   * because real CloudFront runs the replica as the service rather than as
   * whoever made the request, and because a handler that throws has to reach
   * the request pipeline as a failure rather than as an invocation result.
   */
  async invoke(functionArn: string, event: object): Promise<unknown> {
    return await this.target(functionArn).simFunction.invoke(event);
  }

  /**
   * What this ARN names, refusing an ARN that names nothing here.
   */
  private target(functionArn: string): SimLambdaFunctionTarget {
    const arn = edgeFunctionArnParts(functionArn);
    const found = findSimCfEdgeFunctionVersion(this.simAws, arn);

    if (found === undefined) {
      throw new SimCloudFrontInvalidLambdaFunctionAssociation(
        `Sim CloudFront LambdaFunctionARN ${functionArn} names no simulated ` +
          `Lambda function version`,
      );
    }

    return found;
  }

  /**
   * Refuse a function whose execution role Lambda@Edge could not assume.
   *
   * Whether a role can be assumed is IAM's own rule, so the decision is made
   * by the shared service-role helper and CloudFront only says what it means
   * here.
   */
  private async assertExecutionRoleTrust(
    target: SimLambdaFunctionTarget,
    functionArn: string,
  ): Promise<void> {
    const { accountId, regionName } = target.simFunction.accountRegionScope;

    await assumeSimServiceRole({
      target: simServiceRoleTarget(target.simFunction.roleArn),
      servicePrincipal: simLambdaEdgeServicePrincipal,
      sessionName,
      scope: this.simAws.accountRegionScope(accountId, regionName),
      refusals: executionRoleRefusals(functionArn),
    });
  }
}

/**
 * What CloudFront says when a Lambda@Edge execution role is unusable.
 */
function executionRoleRefusals(functionArn: string): SimServiceRoleRefusals {
  return {
    missingRole: (target) =>
      new SimCloudFrontInvalidLambdaFunctionAssociation(
        `Sim CloudFront Lambda@Edge function ${functionArn} has execution ` +
          `role ${target.roleArn}, which is not a simulated IAM role`,
      ),
    untrustedRole: (target, servicePrincipal) =>
      new SimCloudFrontInvalidLambdaFunctionAssociation(
        `The trust policy of ${target.roleArn} does not allow ` +
          `${servicePrincipal} to assume it, so Lambda@Edge could not run ` +
          `${functionArn}. A Lambda@Edge execution role trusts both ` +
          `lambda.amazonaws.com and ${servicePrincipal}. Add it to the ` +
          `role's AssumeRolePolicyDocument.`,
      ),
  };
}
