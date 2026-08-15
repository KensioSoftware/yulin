import type { SimSqsPollMessage } from "../../sqs/poll/sim-sqs-poll-message.js";

/**
 * One message as a consuming container is handed it.
 *
 * These are the queue's own field names, which is what a container reading a
 * queue with the SDK gets back from `ReceiveMessage`.
 */
export type SimEcsQueueMessage = SimSqsPollMessage;

/**
 * What a bound container does with a batch of messages from its queue.
 *
 * This is the body of the loop a real worker container writes, rather than the
 * loop: returning means the batch was handled and can be deleted, and throwing
 * means it was not, which leaves it to come back after the visibility timeout.
 */
export type SimEcsContainerConsumeHandler = (
  messages: readonly SimEcsQueueMessage[],
) => void | Promise<void>;

/**
 * The queue a bound container consumes, and how.
 *
 * The queue is named by its URL, since that is what `CreateQueue` answers with
 * and what a container's own environment usually carries. A batch size is how
 * many messages the handler is given at once, up to the ten SQS will hand out
 * in one receive.
 */
export interface SimEcsContainerQueueConsumer {
  readonly queueUrl: string;
  readonly batchSize?: number;
  readonly handler: SimEcsContainerConsumeHandler;
}

/**
 * What a bound container does when a task runs it.
 *
 * This is the shape of a job container: it does its work and returns, and the
 * task stops once it has. Returning is a clean exit, and throwing is a
 * non-zero one.
 */
export type SimEcsContainerRunHandler = () => void | Promise<void>;

/**
 * What a bound container does when an HTTP request reaches it.
 *
 * This is the shape of a service container behind a load balancer. It is
 * fetch-style, matching what a simulated AWS service controller already
 * answers a served request with, so a container and a Lambda function behind
 * the same listener answer in the same terms.
 *
 * The handler is called once per request a load balancer routes to the
 * container, with the container's environment and the task Role, rather than
 * once per task the service is keeping running.
 */
export type SimEcsContainerHttpHandler = (
  request: Request,
) => Response | Promise<Response>;

/**
 * Which container an executable binding targets.
 *
 * A binding names either the container directly, by the family that declares
 * it and its container name, or the image repository the container declares.
 * The repository form covers a container whose image tag changes with every
 * build, which is every container built by CDK or by a pipeline.
 */
export type SimEcsContainerBindingTarget =
  | {
      readonly family: string;
      readonly containerName: string;
      readonly imageRepository?: never;
    }
  | {
      readonly imageRepository: string;
      readonly family?: never;
      readonly containerName?: never;
    };

/**
 * What a bound container runs, which is one shape or another.
 *
 * A `run` handler is a job container, which does its work and exits. A
 * `consumes` declaration is a worker container, which a real image would put in
 * an endless receive-handle-delete loop. Yulin runs that loop and the binding
 * supplies its body, because an endless loop in a single Node.js process would
 * never yield to the test running it. An `http` handler is a service container
 * behind a load balancer, which answers the requests routed to it.
 */
export type SimEcsContainerBindingHandler =
  | {
      readonly run: SimEcsContainerRunHandler;
      readonly http?: never;
      readonly consumes?: never;
    }
  | {
      readonly http: SimEcsContainerHttpHandler;
      readonly run?: never;
      readonly consumes?: never;
    }
  | {
      readonly consumes: SimEcsContainerQueueConsumer;
      readonly run?: never;
      readonly http?: never;
    };

/**
 * A real in-process handler bound to a container a task definition declares.
 *
 * Yulin never looks inside a container image, so a task can only run code the
 * test supplied. A binding is how that code is supplied, and what it is
 * matched on is either the container's name in its family or the repository
 * its image comes from.
 *
 * ```typescript
 * simAws.ecs().bindContainer({
 *   family: "orders-worker",
 *   containerName: "app",
 *   run: async () => {
 *     await processOutstandingOrders();
 *   },
 * });
 * ```
 */
export type SimEcsContainerBinding = SimEcsContainerBindingTarget &
  SimEcsContainerBindingHandler;
