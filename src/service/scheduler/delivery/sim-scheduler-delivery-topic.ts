import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSchedulerDeliveryNotPermitted,
  SimSchedulerTargetNotFound,
} from "../error/sim-scheduler-delivery.error.js";
import {
  type SimSchedulerAssumedDelivery,
  simSchedulerDeliveryJson,
} from "./sim-scheduler-delivery.js";
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";

const publishAction = "sns:Publish";

interface SimSchedulerDeliveryTopicProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * An SNS topic a simulated schedule publishes to.
 */
export class SimSchedulerDeliveryTopic {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimSchedulerDeliveryTopicProperties) {
    this.scope = properties.scope;
  }

  /**
   * Publish the schedule's input to the topic, if the execution role may.
   */
  async deliver(delivery: SimSchedulerAssumedDelivery): Promise<void> {
    const targetArn = delivery.request.schedule.target.arn;
    const topic = this.scope.sns().findTopic(targetArn.resource);

    if (topic === undefined) {
      throw new SimSchedulerTargetNotFound(
        `${targetArn.value} is not a simulated SNS topic.`,
      );
    }

    const decision = simScopeIamAuthZ(this.scope).authorize({
      action: publishAction,
      resource: targetArn.value,
      caller: delivery.caller,
    });

    if (decision.isDenied) {
      throw new SimSchedulerDeliveryNotPermitted(
        `${delivery.request.schedule.target.roleArn} is not allowed to ` +
          `${publishAction} on ${targetArn.value}. Grant it in a policy on ` +
          `the execution role.`,
      );
    }

    // Published through the ordinary Publish path, as the execution role, so a
    // delivered message fans out to the topic's subscriptions exactly as an SDK
    // caller's would.
    await this.scope.sns().publish(
      {
        input: {
          TopicArn: topic.arn.value,
          Message: simSchedulerDeliveryJson(delivery.request),
        },
      },
      { caller: delivery.caller },
    );
  }
}
