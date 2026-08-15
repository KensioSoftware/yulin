/**
 * What a container with no executable binding records instead of running.
 *
 * It is shared with the containers a service keeps running, because it is the
 * same thing happening to them: nothing here matches the container, so nothing
 * here runs it.
 */
export const simEcsNotSimulatedContainerReason =
  "Not simulated: no executable binding matches this container, so Yulin " +
  "did not run it.";

/**
 * What a container consuming a queue records instead of running in a task.
 *
 * A consuming binding supplies the body of a polling loop rather than something
 * that ends, and a run task has to end. Yulin drives that loop for a service,
 * so a task started from the same definition says where the container does run
 * rather than running it once and calling that a task.
 */
export const simEcsConsumingContainerReason =
  "Not simulated in a run task: this container consumes a queue, which Yulin " +
  "polls for a running service. Create a service from this task definition.";

/**
 * What a container serving requests records instead of running in a task.
 *
 * A serving binding answers a request rather than doing something that ends,
 * and a run task has neither a request to send it nor an end to wait for. A
 * service is what puts the container behind a load balancer, so a task started
 * from the same definition says so rather than calling the handler with
 * nothing.
 */
export const simEcsServingContainerReason =
  "Not simulated in a run task: this container answers HTTP requests, which " +
  "reach it through a load balancer while a service is running it. Create a " +
  "service from this task definition.";

/**
 * What a container reports as the reason it stopped.
 */
export function simEcsContainerFailureReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
