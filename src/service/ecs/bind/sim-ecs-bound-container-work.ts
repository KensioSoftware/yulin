import { SimEcsBoundQueueConsumer } from "./sim-ecs-bound-queue-consumer.js";
import type {
  SimEcsContainerBinding,
  SimEcsContainerRunHandler,
} from "./sim-ecs-container-binding.type.js";

/**
 * What a bound container actually does, read once as the binding is made.
 *
 * A binding says one of three things, and only two of them are simulated. A
 * `run` handler is a job container that does its work and exits. A `consumes`
 * declaration is a worker container, whose real image would sit in an endless
 * receive-handle-delete loop; Yulin runs that loop and the binding supplies its
 * body, because an endless loop in a single Node.js process would never yield
 * to the test running it.
 *
 * An `http` handler is refused rather than held. The shape it takes is settled,
 * so a service container behind a load balancer will not have to renegotiate
 * it, but nothing serves one yet and a binding that is never called is worse
 * than one that says so.
 */
export class SimEcsBoundContainerWork {
  public readonly run: SimEcsContainerRunHandler | undefined;
  public readonly consumes: SimEcsBoundQueueConsumer | undefined;

  constructor(binding: SimEcsContainerBinding) {
    SimEcsBoundContainerWork.refuseHttpBinding(binding);

    if (binding.consumes !== undefined) {
      this.consumes = new SimEcsBoundQueueConsumer(binding.consumes);

      return;
    }

    this.run = SimEcsBoundContainerWork.runHandlerOf(binding);
  }

  private static refuseHttpBinding(binding: SimEcsContainerBinding): void {
    if (binding.http === undefined) {
      return;
    }

    throw new Error(
      "Invalid sim ECS container binding: an http handler is not simulated " +
        "yet, since nothing serves a container. Bind a run handler and run " +
        "the task with RunTask.",
    );
  }

  private static runHandlerOf(
    binding: SimEcsContainerBinding,
  ): SimEcsContainerRunHandler {
    if (typeof binding.run !== "function") {
      throw new TypeError(
        "Invalid sim ECS container binding: a binding needs a run handler, " +
          "which is the function the container runs, or a consumes " +
          "declaration naming the queue the container reads.",
      );
    }

    return binding.run;
  }
}
