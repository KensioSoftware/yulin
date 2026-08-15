/**
 * The parts a test needs before it can say anything about an ECS container
 * consuming a queue: a queue, a task Role that may poll it, a task definition
 * with a consuming binding, and a service keeping the container running.
 *
 * These live under `test/` for the same reason as the SQS queue fixture: the
 * lint rules reject a test file exporting helpers alongside its own `describe`
 * calls.
 */

import {
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";
import { assertNonNullable } from "@kensio/smartass";

import type { BackgroundTasks } from "../../src/util/background/background.js";
import { SimAws } from "../../src/service/aws/sim-aws.js";
import type {
  SimEcsContainerConsumeHandler,
  SimEcsQueueMessage,
} from "../../src/service/ecs/index.js";
import { simIamRoleWithPolicyFactory } from "../../src/service/iam/role/sim-iam-role-with-policy.factory.js";
import { simEcsClusterFactory } from "../../src/service/ecs/cluster/sim-ecs-cluster.factory.js";

/**
 * The SQS operations a real worker container's task Role needs before it can
 * receive, handle and delete.
 */
export const sqsConsumingActions: readonly string[] = [
  "sqs:ReceiveMessage",
  "sqs:DeleteMessage",
  "sqs:GetQueueAttributes",
];

/**
 * A handler that records the batches it is given.
 */
export interface RecordingConsumer {
  readonly handler: SimEcsContainerConsumeHandler;
  readonly batches: readonly (readonly SimEcsQueueMessage[])[];
}

/**
 * What a test does with each batch, beyond having it recorded.
 */
export type OnConsumedBatch = (
  messages: readonly SimEcsQueueMessage[],
) => void | Promise<void>;

/**
 * Make a consuming handler that records every batch, and can be told to throw.
 */
export function recordingConsumer(
  onBatch: OnConsumedBatch = (): undefined => undefined,
): RecordingConsumer {
  const batches: (readonly SimEcsQueueMessage[])[] = [];

  return {
    batches,
    handler: async (messages): Promise<void> => {
      batches.push(messages);
      await onBatch(messages);
    },
  };
}

/**
 * One simulated AWS with a service consuming a queue.
 */
export interface SimEcsConsumingServiceFixture {
  readonly simAws: SimAws;
  readonly queueUrl: string;
  readonly queueArn: string;
  readonly taskRoleArn: string;
  readonly batches: readonly (readonly SimEcsQueueMessage[])[];
}

interface ConsumingServiceOptions {
  readonly simAws?: SimAws;
  readonly background?: BackgroundTasks;
  readonly queueAttributes?: Record<string, string>;
  readonly roleActions?: readonly string[];
  readonly roleResource?: string;
  /** Register the task definition with no task Role at all. */
  readonly withoutTaskRole?: boolean;
  readonly batchSize?: number;
  readonly desiredCount?: number;
  readonly environment?: readonly { name: string; value: string }[];
  readonly onBatch?: OnConsumedBatch;
}

/**
 * Make a queue named `orders` and answer with its URL and ARN.
 */
export async function makeConsumedQueue(
  simAws: SimAws,
  attributes?: Record<string, string>,
): Promise<{ queueUrl: string; queueArn: string }> {
  const created = await simAws.sqs().createQueue(
    new CreateQueueCommand({
      QueueName: "orders",
      ...(attributes !== undefined && { Attributes: attributes }),
    }),
  );
  const queueArn = simAws.sqs().findQueue("orders")?.arn.value;

  assertNonNullable(created.QueueUrl, "CreateQueue answered with a queue URL");
  assertNonNullable(queueArn, "The queue has an ARN");

  return { queueUrl: created.QueueUrl, queueArn };
}

/**
 * Make a simulated AWS with a queue and a running service whose container
 * consumes it.
 *
 * The service is up and its polling has started by the time this answers, so a
 * test can send a message and assert on what the handler was given.
 */
export async function simAwsWithConsumingService(
  options: ConsumingServiceOptions = {},
): Promise<SimEcsConsumingServiceFixture> {
  const simAws =
    options.simAws ??
    new SimAws(
      options.background === undefined
        ? {}
        : { background: options.background },
    );
  const ecs = simAws.ecs();
  const { queueUrl, queueArn } = await makeConsumedQueue(
    simAws,
    options.queueAttributes,
  );
  const taskRole = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "OrdersTaskRole",
      actions: [...(options.roleActions ?? sqsConsumingActions)],
      resource: options.roleResource ?? queueArn,
    },
    simAws,
  );
  const { handler, batches } = recordingConsumer(options.onBatch);

  ecs.bindContainer({
    family: "orders-worker",
    containerName: "app",
    consumes: {
      queueUrl,
      ...(options.batchSize !== undefined && { batchSize: options.batchSize }),
      handler,
    },
  });

  await simEcsClusterFactory.make({}, simAws);
  await ecs.registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "orders-worker",
      ...(options.withoutTaskRole !== true && { taskRoleArn: taskRole.Arn }),
      containerDefinitions: [
        {
          name: "app",
          image: "orders-worker:1",
          ...(options.environment !== undefined && {
            environment: [...options.environment],
          }),
        },
      ],
    }),
  );
  await ecs.createService(
    new CreateServiceCommand({
      serviceName: "orders-worker",
      taskDefinition: "orders-worker",
      desiredCount: options.desiredCount ?? 1,
    }),
  );
  await simAws.backgroundTasksComplete();

  const taskRoleArn = taskRole.Arn;

  assertNonNullable(taskRoleArn, "CreateRole answered with a Role ARN");

  return { simAws, queueUrl, queueArn, taskRoleArn, batches };
}
