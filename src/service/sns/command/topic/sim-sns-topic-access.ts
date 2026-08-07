import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimSnsInvalidParameterException,
  SimSnsNotFoundException,
} from "../../error/sim-sns.error.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import {
  parseSnsTopicArn,
  snsTopicArnPrefix,
} from "../../topic/sim-sns-topic-arn.js";
import type { SimSnsTopicStore } from "../../topic/sim-sns-topic-store.js";
import type { SimSnsAuthorizer } from "../authorize/sim-sns-authorizer.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";

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
  ): void {
    this.authorizer.authorizeTopic({
      action,
      topicArn: snsTopicArnPrefix(this.accountRegionScope) + name,
      topic: this.topics.find(name),
      options,
    });
  }

  /**
   * Ensure the caller may perform an action naming no particular topic.
   */
  authorizeAnyTopic(action: string, options?: SimSnsRequestOptions): void {
    this.authorizer.authorizeAnyTopic(action, options);
  }

  /**
   * Resolve the topic a request names by ARN, authorizing the action first.
   */
  requireByArn(
    action: string,
    topicArn: string | undefined,
    options?: SimSnsRequestOptions,
  ): SimSnsTopic {
    return this.topics.require(this.authorizedName(action, topicArn, options));
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
    return this.topics.find(this.authorizedName(action, topicArn, options));
  }

  /**
   * The name of the topic a request names, once the caller is allowed to reach
   * it.
   */
  private authorizedName(
    action: string,
    topicArn: string | undefined,
    options: SimSnsRequestOptions | undefined,
  ): string {
    const name = this.nameFromArn(topicArn);

    this.authorizeName(action, name, options);

    return name;
  }

  /**
   * Read the topic name out of the ARN a request carries.
   *
   * An ARN naming another Account or Region reaches nothing, rather than having
   * its name read out and looked up locally. A topic ARN is scoped, and
   * treating a foreign one as local would let a test pass while the real call
   * crossed an Account boundary it has no permission for.
   */
  private nameFromArn(topicArn: string | undefined): string {
    if (topicArn === undefined || topicArn === "") {
      throw new SimSnsInvalidParameterException(
        "Invalid parameter: TopicArn is required",
      );
    }

    const parts = parseSnsTopicArn(topicArn);

    if (parts === undefined) {
      throw new SimSnsInvalidParameterException(
        `Invalid parameter: TopicArn Reason: ${topicArn} is not a topic ARN, ` +
          `which is arn:aws:sns:<region>:<account-id>:<topic-name>`,
      );
    }

    const { accountId, regionName } = this.accountRegionScope;

    if (parts.accountId !== accountId || parts.regionName !== regionName) {
      throw new SimSnsNotFoundException(
        `Topic does not exist: ${topicArn} names Account ${parts.accountId} ` +
          `in ${parts.regionName}, and this simulated SNS is Account ` +
          `${accountId} in ${regionName}`,
      );
    }

    return parts.name;
  }
}
