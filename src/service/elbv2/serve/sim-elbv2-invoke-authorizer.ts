import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimLambdaFunction } from "../../lambda/function/sim-lambda-function.js";
import type { SimElbV2TargetGroup } from "../target-group/sim-elbv2-target-group.js";

/**
 * The service principal Elastic Load Balancing invokes a Lambda function as.
 */
export const simElbV2ServicePrincipal = "elasticloadbalancing.amazonaws.com";

interface SimElbV2InvokeAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimElbV2InvokeAuthorizationInput {
  readonly simFunction: SimLambdaFunction;
  readonly targetGroup: SimElbV2TargetGroup;
  readonly accountId: string;
}

/**
 * Decides whether a load balancer may invoke the function in a target group.
 *
 * A Lambda target registered through CloudFormation, the CLI or an SDK does not
 * serve anything until the function's resource policy allows
 * `elasticloadbalancing.amazonaws.com` to invoke it. That grant is the one
 * thing standing between a target group that looks configured and one that
 * answers, and forgetting it is a common way to get a load balancer that
 * returns nothing but errors.
 *
 * Whether a service may invoke a function is Lambda's own rule, so the decision
 * is made there. What this adds is the part only ELB knows: which target group
 * is calling.
 *
 * The answer is a decision rather than a thrown error, because a refusal is an
 * ordinary HTTP outcome: the load balancer answers 502 the way real ELB does,
 * with nothing to propagate to a caller in process.
 */
export class SimElbV2InvokeAuthorizer {
  private readonly lambdaAuthorizer: SimLambdaServiceInvokeAuthorizer;

  constructor(properties: SimElbV2InvokeAuthorizerProperties) {
    this.lambdaAuthorizer = new SimLambdaServiceInvokeAuthorizer({
      iam: properties.iam,
    });
  }

  /**
   * Evaluate `lambda:InvokeFunction` for the load balancer against the
   * function.
   *
   * The target group is supplied as `AWS:SourceArn` and its Account as
   * `AWS:SourceAccount`, which is what the `add-permission` call in the ELB
   * documentation names, so a permission granted for one target group does not
   * open another.
   */
  authorize(
    input: SimElbV2InvokeAuthorizationInput,
  ): SimIamAuthorizationDecision {
    return this.lambdaAuthorizer.authorize({
      resource: input.simFunction,
      servicePrincipal: simElbV2ServicePrincipal,
      sourceArn: input.targetGroup.arn,
      sourceAccount: input.accountId,
    });
  }
}
