import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import { simAwsRunAsContext } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimSqsPollMessage } from "../../../sqs/poll/sim-sqs-poll-message.js";
import type {
  SimSqsPollConsumer,
  SimSqsPollOutcome,
  SimSqsPollSession,
} from "../../../sqs/poll/sim-sqs-queue-poller.js";
import type { SimEcsBoundQueueConsumer } from "../../bind/sim-ecs-bound-queue-consumer.js";
import type { SimEcsContainerEnvironment } from "../../task/run/sim-ecs-container-environment.js";
import { simEcsTaskPrincipal } from "../../task/run/sim-ecs-task-principal.js";

interface SimEcsContainerConsumerProperties {
  readonly consumes: SimEcsBoundQueueConsumer;
  readonly environment: SimEcsContainerEnvironment;
  readonly taskRoleArn: string | undefined;
  readonly runAsOwner: SimAwsRunAsOwner;
}

/**
 * One container of a running service consuming its queue.
 *
 * This is the body of the loop, and the poller behind it is the loop. A real
 * worker image writes both, receiving, handling and deleting until it is
 * killed; a bound handler cannot, because an endless loop in a single Node.js
 * process never yields to the test running it. So the binding supplies what
 * happens to a batch and Yulin decides when the next one is asked for.
 *
 * Receiving and deleting are made as the task Role, and so is anything the
 * handler itself does, exactly as they would be for the deployed container: a
 * task Role without `sqs:DeleteMessage` leaves the messages where a real one
 * would leave them.
 */
export class SimEcsContainerConsumer implements SimSqsPollConsumer {
  private readonly consumes: SimEcsBoundQueueConsumer;
  private readonly environment: SimEcsContainerEnvironment;
  private readonly taskRoleArn: string | undefined;
  private readonly runAsOwner: SimAwsRunAsOwner;

  constructor(properties: SimEcsContainerConsumerProperties) {
    this.consumes = properties.consumes;
    this.environment = properties.environment;
    this.taskRoleArn = properties.taskRoleArn;
    this.runAsOwner = properties.runAsOwner;
  }

  /**
   * What this container's next poll is made as and asks for.
   *
   * There is no state to check: a service container is available for as long as
   * the service is keeping it, and the poller is stopped outright when it is
   * not.
   */
  session(): SimSqsPollSession {
    return {
      caller: simEcsTaskPrincipal(this.taskRoleArn),
      batchSize: this.consumes.batchSize,
      handle: async (
        messages: readonly SimSqsPollMessage[],
      ): Promise<SimSqsPollOutcome> => await this.handle(messages),
    };
  }

  /**
   * Hand one batch to the container, and say what becomes of it.
   *
   * A handler that returns has handled the batch, so it is deleted. One that
   * throws has not, so the whole batch is left to reappear when its visibility
   * timeout runs out, which is what a real container crashing part way through
   * a batch does. As on real AWS the error goes no further than the container:
   * what the sender sees is the message coming back.
   */
  private async handle(
    messages: readonly SimSqsPollMessage[],
  ): Promise<SimSqsPollOutcome> {
    try {
      await this.asTaskRole(async () => {
        await this.environment.runWith(async () => {
          await this.consumes.handle(messages);
        });
      });
    } catch {
      return { handledReceiptHandles: [], hasReturnedMessages: true };
    }

    return {
      handledReceiptHandles: messages.map((message) => message.ReceiptHandle),
      hasReturnedMessages: false,
    };
  }

  private async asTaskRole<T>(run: () => Promise<T>): Promise<T> {
    return await simAwsRunAsContext.run(
      this.runAsOwner,
      simEcsTaskPrincipal(this.taskRoleArn),
      run,
    );
  }
}
