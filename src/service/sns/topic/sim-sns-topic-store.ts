import { SimSnsNotFoundException } from "../error/sim-sns.error.js";
import type { SimSnsTopic } from "./sim-sns-topic.js";

/**
 * The topics of one simulated SNS scope.
 *
 * Topics are keyed by name, which is the whole of their identity: the name is
 * the resource part of the ARN, and it is unique within one Account and Region.
 *
 * Nothing holds a deleted topic's name, unlike simulated SQS. Real SNS frees a
 * topic name as soon as the topic is gone, so a name can be reused straight
 * away.
 */
export class SimSnsTopicStore {
  private readonly topics = new Map<string, SimSnsTopic>();

  /**
   * Every topic in this scope, in creation order.
   */
  get all(): readonly SimSnsTopic[] {
    return this.topics.values().toArray();
  }

  /**
   * Store a newly created topic.
   */
  add(topic: SimSnsTopic): void {
    this.topics.set(topic.name.value, topic);
  }

  /**
   * Find a topic by name.
   */
  find(name: string): SimSnsTopic | undefined {
    return this.topics.get(name);
  }

  /**
   * Resolve a topic by name, or refuse.
   */
  require(name: string): SimSnsTopic {
    const found = this.find(name);

    if (found === undefined) {
      throw new SimSnsNotFoundException(
        `Topic does not exist: no topic named '${name}' in this Account and ` +
          `Region`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted topic.
   */
  remove(topic: SimSnsTopic): void {
    this.topics.delete(topic.name.value);
  }
}
