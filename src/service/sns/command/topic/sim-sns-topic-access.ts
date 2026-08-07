import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import { snsTopicArnPrefix } from "../../topic/sim-sns-topic-arn.js";
import type { SimSnsTopicStore } from "../../topic/sim-sns-topic-store.js";
import type { SimSnsAuthorizer } from "../authorize/sim-sns-authorizer.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import { simSnsRequestTopicName } from "./sim-sns-request-topic-name.js";

/**
 * A topic a request reached, and the caller that reached it.
 *
 * Subscribe is the one command that needs both: the subscription it creates
 * records the Account making the request as its owner, which is not the topic's
 * Account when another Account subscribes to it.
 */
export interface SimSnsAuthorizedTopic {
  readonly topic: SimSnsTopic;
  readonly caller: SimAwsResolvedCaller;
}

/**
 * The name of the topic a request reached, and the caller that reached it.
 */
interface SimSnsAuthorizedTopicName {
  readonly name: string;
  readonly caller: SimAwsResolvedCaller;
}

interface SimSnsTopicAccessProperties {
  readonly topics: SimSnsTopicStore;
  readonly authorizer: SimSnsAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a request reaches the topic it names.
 *
 * Every operation but ListTopics and CreateTopic starts the same way: read the
 * topic ARN, find the topic that ARN implies, authorize the action against it,
 * then require it to be there.
 *
 * Finding the topic comes before authorizing because the topic's own policy is
 * part of the decision, and nothing can supply a policy without first having
 * the topic. A caller with no permission is still refused for a topic that does
 * not exist rather than told the topic is missing, because a topic that is not
 * there contributes no policy and cannot admit anyone.
 */
export class SimSnsTopicAccess {
  private readonly topics: SimSnsTopicStore;
  private readonly authorizer: SimSnsAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSnsTopicAccessProperties) {
    this.topics = properties.topics;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on the topic of a given name.
   *
   * The topic need not exist, which is what CreateTopic needs: it authorizes
   * against the ARN the topic is about to have. A topic that is there brings
   * its policy into the decision.
   */
  authorizeName(
    action: string,
    name: string,
    options?: SimSnsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizer.authorizeTopic({
      action,
      topicArn: snsTopicArnPrefix(this.accountRegionScope) + name,
      topic: this.topics.find(name),
      options,
    });
  }

  /**
   * Ensure the caller may perform an action naming no particular topic.
   */
  authorizeAnyTopic(
    action: string,
    options?: SimSnsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizer.authorizeAnyTopic(action, options);
  }

  /**
   * Resolve the topic a request names by ARN, authorizing the action first.
   */
  requireByArn(
    action: string,
    topicArn: string | undefined,
    options?: SimSnsRequestOptions,
  ): SimSnsTopic {
    return this.requireByArnForCaller(action, topicArn, options).topic;
  }

  /**
   * Resolve the topic a request names, along with the caller that named it.
   */
  requireByArnForCaller(
    action: string,
    topicArn: string | undefined,
    options?: SimSnsRequestOptions,
  ): SimSnsAuthorizedTopic {
    const authorized = this.authorizedName(action, topicArn, options);

    return {
      topic: this.topics.require(authorized.name),
      caller: authorized.caller,
    };
  }

  /**
   * Resolve the topic a request names by ARN, or nothing when there is none.
   *
   * This is what DeleteTopic needs. Real SNS treats it as idempotent, so
   * deleting a topic that is not there succeeds, and the caller still has to be
   * allowed to delete it.
   */
  findByArn(
    action: string,
    topicArn: string | undefined,
    options?: SimSnsRequestOptions,
  ): SimSnsTopic | undefined {
    return this.topics.find(
      this.authorizedName(action, topicArn, options).name,
    );
  }

  /**
   * The name of the topic a request names, once the caller is allowed to reach
   * it.
   */
  private authorizedName(
    action: string,
    topicArn: string | undefined,
    options: SimSnsRequestOptions | undefined,
  ): SimSnsAuthorizedTopicName {
    const name = simSnsRequestTopicName(topicArn, this.accountRegionScope);

    return { name, caller: this.authorizeName(action, name, options) };
  }
}
