import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  simLambdaSourceAccountConditionKey,
  simLambdaSourceArnConditionKey,
} from "../../function/policy/sim-lambda-permission.js";
import type { SimLambdaPolicyResource } from "../../function/policy/sim-lambda-policy-resource.js";
import type { SimIamConditionValue } from "../../../iam/policy/sim-iam-policy.js";
import { simLambdaResourcePolicies } from "./sim-lambda-resource-policies.js";

interface SimLambdaServiceInvokeAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimLambdaServiceInvokeAuthorizationInput {
  /**
   * What the service is invoking, which is a function, a published version or
   * an alias.
   *
   * Each qualified resource holds a policy of its own. A delivery to the alias
   * `live` is admitted by a grant made on `live`, and one to the function
   * itself by a grant on the function.
   */
  readonly resource: SimLambdaPolicyResource;

  /** The service principal the invoking service calls Lambda as. */
  readonly servicePrincipal: string;

  /**
   * What the service is invoking the function for, such as the API Gateway
   * route a request matched or the S3 Bucket an event came from.
   */
  readonly sourceArn?: string | undefined;

  /** The Account the invoking service's own resource belongs to. */
  readonly sourceAccount?: string | undefined;
}

/**
 * Decides whether a simulated AWS service may invoke a Lambda function.
 *
 * A function invoked by another service does not run until its resource policy
 * allows that service principal to invoke it, which is what `AddPermission`
 * grants. The invoking service is the caller, so the caller's own identity
 * policies are not what admits the call: a service principal owns none, and the
 * function's resource policy is the whole decision.
 *
 * Who may invoke a function is Lambda's rule rather than the calling service's,
 * so every service that invokes a function asks here. The answer is a decision
 * rather than a thrown error, because what a refusal means is the calling
 * service's own business: API Gateway answers 500, and an event source drops
 * the event.
 */
export class SimLambdaServiceInvokeAuthorizer {
  private static readonly action = "lambda:InvokeFunction";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimLambdaServiceInvokeAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Evaluate `lambda:InvokeFunction` for a service against the function.
   *
   * The source ARN and the source Account are supplied as `AWS:SourceArn` and
   * `AWS:SourceAccount`, so a permission granted for one resource does not open
   * another, and a permission naming an Account only admits that Account's
   * resources.
   */
  authorize(
    input: SimLambdaServiceInvokeAuthorizationInput,
  ): SimIamAuthorizationDecision {
    return this.iam.authorize({
      action: SimLambdaServiceInvokeAuthorizer.action,
      resource: input.resource.arn,
      caller: { kind: "service", service: input.servicePrincipal },
      resourcePolicies: simLambdaResourcePolicies(input.resource),
      conditionContext: this.conditionContext(input),
    });
  }

  /**
   * The request-time values a statement's conditions are matched against.
   *
   * A value the calling service does not have is left out rather than supplied
   * empty, so a statement conditioned on it fails to match instead of matching
   * an empty string.
   */
  private conditionContext(
    input: SimLambdaServiceInvokeAuthorizationInput,
  ): Readonly<Record<string, SimIamConditionValue>> {
    return {
      ...(input.sourceArn !== undefined && {
        [simLambdaSourceArnConditionKey]: input.sourceArn,
      }),
      ...(input.sourceAccount !== undefined && {
        [simLambdaSourceAccountConditionKey]: input.sourceAccount,
      }),
    };
  }
}
