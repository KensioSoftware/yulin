import { randomUUID } from "node:crypto";

import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";
import {
  SimSchedulerDeliveryNotPermitted,
  SimSchedulerTargetNotFound,
} from "../error/sim-scheduler-delivery.error.js";
import { simSchedulerDeliveryJson } from "./sim-scheduler-delivery.js";
import type {
  SimSchedulerAssumedDelivery,
  SimSchedulerDeadLetterRequest,
} from "./sim-scheduler-delivery.js";

const sendAction = "sqs:SendMessage";

interface SimSchedulerDeadLetterQueueProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * Sends an undelivered schedule input to a standard SQS queue.
 */
export class SimSchedulerDeadLetterQueue {
  private readonly scope: SimAwsAccountRegionContainer;

  constructor(properties: SimSchedulerDeadLetterQueueProperties) {
    this.scope = properties.scope;
  }

  /**
   * Send the original input with Scheduler's diagnostic message attributes.
   */
  async deliver(
    assumed: SimSchedulerAssumedDelivery,
    deadLetter: SimSchedulerDeadLetterRequest,
  ): Promise<void> {
    const target = deadLetter.delivery.schedule.target;
    const queueArn = target.deadLetterConfig?.arn;
    const queue =
      queueArn === undefined
        ? undefined
        : this.scope.sqs().findQueue(queueArn.split(":").at(-1) ?? "");

    if (queue === undefined || queueArn === undefined) {
      throw new SimSchedulerTargetNotFound(
        `${queueArn ?? "The configured dead-letter queue"} is not a ` +
          `simulated SQS queue.`,
      );
    }

    const decision = simScopeIamAuthZ(this.scope).authorize({
      action: sendAction,
      resource: queueArn,
      caller: assumed.caller,
    });

    if (decision.isDenied) {
      throw new SimSchedulerDeliveryNotPermitted(
        `${target.roleArn} is not allowed to ${sendAction} on ${queueArn}. ` +
          `Grant it in a policy on the execution role.`,
      );
    }

    await this.scope.sqs().sendMessage(
      {
        input: {
          QueueUrl: queue.arn.url,
          MessageBody: simSchedulerDeliveryJson(deadLetter.delivery),
          MessageAttributes: this.attributes(deadLetter),
        },
      },
      { caller: assumed.caller },
    );
  }

  private attributes(
    deadLetter: SimSchedulerDeadLetterRequest,
  ): Readonly<
    Record<string, { readonly DataType: string; readonly StringValue: string }>
  > {
    const { delivery, error, retryAttempts, exhaustedCondition } = deadLetter;
    const errorCode = error instanceof Error ? error.name : "Error";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const attributes = {
      ERROR_CODE: errorCode,
      ERROR_MESSAGE: errorMessage,
      EXECUTION_ID: randomUUID(),
      IS_PAYLOAD_TRUNCATED: "false",
      RETRY_ATTEMPTS: String(retryAttempts),
      SCHEDULED_TIME: delivery.at.toISOString(),
      SCHEDULE_ARN: delivery.schedule.arn,
      TARGET_ARN: delivery.schedule.target.arn.value,
      ...(exhaustedCondition !== undefined && {
        EXHAUSTED_RETRY_CONDITION: exhaustedCondition,
      }),
    };

    return Object.fromEntries(
      Object.entries(attributes).map(([name, value]) => [
        name,
        { DataType: "String", StringValue: value },
      ]),
    );
  }
}
