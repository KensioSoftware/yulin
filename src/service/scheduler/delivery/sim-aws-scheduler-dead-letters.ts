import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { parseSqsQueueArn } from "../../sqs/queue/sim-sqs-queue-arn.js";
import type { SimSchedulerDeadLetterRequest } from "./sim-scheduler-delivery.js";
import { SimSchedulerDeadLetterQueue } from "./sim-scheduler-dead-letter-queue.js";
import {
  assumeSchedulerExecutionRole,
  schedulerExecutionRoleTarget,
} from "./sim-scheduler-execution-role.js";

interface SimAwsSchedulerDeadLettersProperties {
  readonly simAws: SimAws;
}

/**
 * Routes Scheduler dead letters to the Account and Region named by their queue ARNs.
 */
export class SimAwsSchedulerDeadLetters {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsSchedulerDeadLettersProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Assume the execution role and send an abandoned input to its queue.
   */
  async deliver(deadLetter: SimSchedulerDeadLetterRequest): Promise<void> {
    const { schedule } = deadLetter.delivery;
    const queueArn = schedule.target.deadLetterConfig?.arn;

    assertDefined(queueArn, "A dead-letter delivery requires a queue ARN");

    const queue = parseSqsQueueArn(queueArn);

    assertDefined(queue, `${queueArn} is not a standard SQS queue ARN`);

    const role = schedulerExecutionRoleTarget(schedule.target.roleArn);
    const regionName = queue.regionName as AwsRegionName;
    const roleScope = this.simAws.accountRegionScope(
      role.accountId,
      regionName,
    );
    const caller = await assumeSchedulerExecutionRole(
      role,
      roleScope,
      schedule,
    );
    const scope = this.simAws.accountRegionScope(
      queue.accountId as SimAwsAccountId,
      regionName,
    );

    await new SimSchedulerDeadLetterQueue({ scope }).deliver(
      { request: deadLetter.delivery, caller },
      deadLetter,
      queueArn,
      queue.name,
    );
  }
}
