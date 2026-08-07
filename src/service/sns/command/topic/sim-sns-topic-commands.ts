import type { SimSnsTopicStore } from "../../topic/sim-sns-topic-store.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "./sim-sns-topic-access.js";
import { SimSnsTopicPage } from "./sim-sns-topic-page.js";
import type {
  SimDeleteTopicCommand,
  SimDeleteTopicCommandOutput,
  SimListTopicsCommand,
  SimListTopicsCommandOutput,
} from "./topic.command.js";

interface SimSnsTopicCommandsProperties {
  readonly topics: SimSnsTopicStore;
  readonly access: SimSnsTopicAccess;
}

/**
 * The commands that list and delete topics.
 */
export class SimSnsTopicCommands {
  private readonly topics: SimSnsTopicStore;
  private readonly access: SimSnsTopicAccess;

  constructor(properties: SimSnsTopicCommandsProperties) {
    this.topics = properties.topics;
    this.access = properties.access;
  }

  /**
   * List the topics in this scope, oldest first.
   *
   * Real SNS gives this action no topic-level permission, so it authorizes
   * against every topic in the Account and Region and does not filter the list
   * by what the caller can reach.
   */
  listTopics(
    command: SimListTopicsCommand,
    options?: SimSnsRequestOptions,
  ): SimListTopicsCommandOutput {
    this.access.authorizeAnyTopic("sns:ListTopics", options);

    const page = new SimSnsTopicPage(this.topics.all, command.input.NextToken);

    return {
      $metadata: {},
      Topics: page.topics.map((topic) => ({ TopicArn: topic.arn.value })),
      NextToken: page.nextToken,
    };
  }

  /**
   * Delete a topic.
   *
   * Real SNS frees the name at once, unlike SQS, so a topic can be recreated
   * under the same name straight away. Deleting a topic that is not there
   * succeeds, as it does on real SNS, which is why the topic is looked for
   * rather than required.
   */
  deleteTopic(
    command: SimDeleteTopicCommand,
    options?: SimSnsRequestOptions,
  ): SimDeleteTopicCommandOutput {
    const topic = this.access.findByArn(
      "sns:DeleteTopic",
      command.input.TopicArn,
      options,
    );

    if (topic !== undefined) {
      this.topics.remove(topic);
    }

    return { $metadata: {} };
  }
}
