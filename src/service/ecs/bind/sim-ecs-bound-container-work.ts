import { SimEcsBoundQueueConsumer } from "./sim-ecs-bound-queue-consumer.js";
import type {
  SimEcsContainerBinding,
  SimEcsContainerHttpHandler,
  SimEcsContainerRunHandler,
} from "./sim-ecs-container-binding.type.js";

/**
 * What a bound container actually does, read once as the binding is made.
 *
 * A binding says one of three things. A `run` handler is a job container that
 * does its work and exits. A `consumes` declaration is a worker container,
 * whose real image would sit in an endless receive-handle-delete loop; Yulin
 * runs that loop and the binding supplies its body, because an endless loop in
 * a single Node.js process would never yield to the test running it. An `http`
 * handler is a service container behind a load balancer, called once per
 * request that reaches it.
 */
export class SimEcsBoundContainerWork {
  public readonly run: SimEcsContainerRunHandler | undefined;
  public readonly consumes: SimEcsBoundQueueConsumer | undefined;
  public readonly serves: SimEcsContainerHttpHandler | undefined;

  constructor(binding: SimEcsContainerBinding) {
    if (binding.consumes !== undefined) {
      this.consumes = new SimEcsBoundQueueConsumer(binding.consumes);

      return;
    }

    if (binding.http !== undefined) {
      this.serves = SimEcsBoundContainerWork.httpHandlerOf(binding.http);

      return;
    }

    this.run = SimEcsBoundContainerWork.runHandlerOf(binding);
  }

  private static httpHandlerOf(
    handler: SimEcsContainerHttpHandler,
  ): SimEcsContainerHttpHandler {
    if (typeof handler !== "function") {
      throw new TypeError(
        "Invalid sim ECS container binding: a serving container needs an " +
          "http handler, which is what it answers a request with.",
      );
    }

    return handler;
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
