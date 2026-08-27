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

const sendAction = "sqs:SendMessage";

interface SimSchedulerDeliveryQueueProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * An SQS queue a simulated schedule sends to.
 */
export class SimSchedulerDeliveryQueue {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimSchedulerDeliveryQueueProperties) {
    this.scope = properties.scope;
  }

  /**
   * Send the schedule's input to the queue, if the execution role may.
   */
  async deliver(delivery: SimSchedulerAssumedDelivery): Promise<void> {
    const targetArn = delivery.request.schedule.target.arn;
    const queue = this.scope.sqs().findQueue(targetArn.resource);

    if (queue === undefined) {
      throw new SimSchedulerTargetNotFound(
        `${targetArn.value} is not a simulated SQS queue.`,
      );
    }

    const decision = simScopeIamAuthZ(this.scope).authorize({
      action: sendAction,
      resource: targetArn.value,
      caller: delivery.caller,
    });

    if (decision.isDenied) {
      throw new SimSchedulerDeliveryNotPermitted(
        `${delivery.request.schedule.target.roleArn} is not allowed to ` +
          `${sendAction} on ${targetArn.value}. Grant it in a policy on the ` +
          `execution role.`,
      );
    }

    // Sent through the ordinary SendMessage path, as the execution role, so a
    // delivered message is the same thing an SDK caller would have sent and is
    // authorized again on the way in.
    await this.scope.sqs().sendMessage(
      {
        input: {
          QueueUrl: queue.arn.url,
          MessageBody: simSchedulerDeliveryJson(delivery.request),
        },
      },
      { caller: delivery.caller },
    );
  }
}
