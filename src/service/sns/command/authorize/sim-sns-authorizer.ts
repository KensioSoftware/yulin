import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamResourcePolicyInput } from "../../../iam/authorize/context/sim-iam-auth-z-context-builder.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { SimSnsAuthorizationErrorException } from "../../error/sim-sns.error.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import { snsAnyTopicArn } from "../../topic/sim-sns-topic-arn.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import { simSnsConditionContext } from "./sim-sns-condition-context.js";
import { simSnsTopicResourcePolicies } from "./sim-sns-topic-resource-policies.js";

interface SimSnsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

interface SimSnsTopicAuthorizationInput {
  readonly action: string;
  readonly topicArn: string;

  /**
   * The topic itself, when there is one. Its policy is what admits a caller
   * with no identity policy of its own.
   */
  readonly topic?: SimSnsTopic | undefined;

  readonly options?: SimSnsRequestOptions | undefined;
}

interface SimSnsResourceAuthorizationInput {
  readonly action: string;
  readonly resource: string;
  readonly resourcePolicies: readonly SimIamResourcePolicyInput[];
  readonly options: SimSnsRequestOptions | undefined;
}

/**
 * Applies simulated IAM authorization to SNS requests.
 *
 * A topic ARN has no resource type in it, so the resource an operation
 * authorizes against is `arn:aws:sns:region:account:topic-name`. A policy
 * written with a `topic/` in the resource matches nothing here, as it matches
 * nothing on real AWS.
 *
 * The topic's own policy goes into the decision as its resource policy. That is
 * what admits a caller from another Account or a service principal, since
 * neither is covered by an identity policy in the Account owning the topic.
 *
 * ListTopics is the exception: real SNS gives it no topic-level permission, so
 * it authorizes against every topic in the account and region rather than one
 * of them, and no topic policy applies to it.
 *
 * A denial is reported as SNS's own AuthorizationErrorException rather than the
 * shared IAM error, because that is the error a real SNS caller would have to
 * handle.
 */
export class SimSnsAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(properties: SimSnsAuthorizerProperties) {
    this.iam = properties.iam;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a topic, named by its ARN.
   *
   * The topic need not exist. A topic that is not there contributes no policy,
   * so a caller with no permission is refused whether or not the topic is
   * there, and CreateTopic authorizes against the ARN the topic is about to
   * have.
   */
  authorizeTopic(input: SimSnsTopicAuthorizationInput): SimAwsResolvedCaller {
    return this.authorizeResource({
      action: input.action,
      resource: input.topicArn,
      resourcePolicies: simSnsTopicResourcePolicies(input.topic),
      options: input.options,
    });
  }

  /**
   * Ensure the caller may perform an action that names no particular topic.
   */
  authorizeAnyTopic(
    action: string,
    options?: SimSnsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource({
      action,
      resource: snsAnyTopicArn(this.accountRegionScope),
      resourcePolicies: [],
      options,
    });
  }

  private authorizeResource(
    input: SimSnsResourceAuthorizationInput,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action: input.action,
      resource: input.resource,
      caller: input.options?.caller,
      resourcePolicies: input.resourcePolicies,
      conditionContext: simSnsConditionContext(input.options),
    });

    if (decision.isDenied) {
      const identifier = this.callerIdentifier.format(
        decision.caller.principal,
      );

      throw new SimSnsAuthorizationErrorException(
        `User: ${identifier} is not authorized to perform: ${input.action} ` +
          `on resource: ${input.resource}`,
      );
    }

    return decision.caller;
  }
}
