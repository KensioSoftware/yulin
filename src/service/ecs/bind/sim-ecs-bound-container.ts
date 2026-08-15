import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimCfnImageRepositoryTarget } from "../../cloudformation/bind/validate/sim-cfn-image-repository-target.js";
import type { SimEcsContainerDefinition } from "../task-definition/container/sim-ecs-container-definition.js";
import { SimEcsBoundContainerWork } from "./sim-ecs-bound-container-work.js";
import type { SimEcsBoundQueueConsumer } from "./sim-ecs-bound-queue-consumer.js";
import type {
  SimEcsContainerBinding,
  SimEcsContainerHttpHandler,
} from "./sim-ecs-container-binding.type.js";

/**
 * One executable binding, read once and ready to be matched against.
 *
 * A binding is checked as it is made rather than when a task runs it. Binding
 * is something a test does while setting up, so a binding that could never
 * match anything is worth refusing there, where the mistake is.
 *
 * The image repository is matched by the same target the CloudFormation
 * bindings use, so a repository means the same thing to a container as it does
 * to a container image Lambda function: the registry host and the repository
 * name have to match, and the tag is ignored on both sides.
 */
export class SimEcsBoundContainer {
  public readonly family: string | undefined;
  public readonly containerName: string | undefined;
  public readonly imageRepository: string | undefined;

  private readonly work: SimEcsBoundContainerWork;
  private readonly repositoryTarget: SimCfnImageRepositoryTarget | undefined;

  constructor(binding: SimEcsContainerBinding) {
    this.family = binding.family;
    this.containerName = binding.containerName;
    this.imageRepository = binding.imageRepository;
    this.repositoryTarget = SimEcsBoundContainer.targetFor(
      binding.imageRepository,
    );
    this.work = new SimEcsBoundContainerWork(binding);

    this.refuseTargetlessBinding();
  }

  private static targetFor(
    imageRepository: string | undefined,
  ): SimCfnImageRepositoryTarget | undefined {
    if (imageRepository === undefined || imageRepository === "") {
      return undefined;
    }

    return new SimCfnImageRepositoryTarget(imageRepository);
  }

  /**
   * The queue this binding consumes, where it consumes one.
   *
   * A consuming container is the one thing a service runs and a run task does
   * not: it has no handler that ends, so there is nothing for `RunTask` to run
   * to completion.
   */
  get consumes(): SimEcsBoundQueueConsumer | undefined {
    return this.work.consumes;
  }

  /**
   * The handler this binding answers a request with, where it serves one.
   *
   * A serving container is the other thing a service runs and a run task does
   * not: what it supplies is an answer to a request, and a run task has nothing
   * to send it.
   */
  get serves(): SimEcsContainerHttpHandler | undefined {
    return this.work.serves;
  }

  /**
   * Whether this binding targets a container declared by a family.
   *
   * A binding naming the family and the container name matches only that
   * container. One naming an image repository matches any container whose
   * image comes from it, whichever family declared it.
   */
  targets(family: string, container: SimEcsContainerDefinition): boolean {
    if (this.repositoryTarget !== undefined) {
      return this.repositoryTarget.matchesImageUri(container.image);
    }

    return this.family === family && this.containerName === container.name;
  }

  /**
   * Whether this binding names a container directly rather than by image.
   *
   * A directly named container is the more specific of the two, so it is the
   * one that wins where both would match.
   */
  isNamedTarget(): boolean {
    return this.repositoryTarget === undefined;
  }

  /**
   * Run this binding's handler.
   *
   * A consuming or serving binding has none: what each supplies is the body of
   * something else, a loop Yulin drives or a request something else brings, so
   * there is nothing here for a task to run.
   */
  async runHandler(): Promise<void> {
    const { run } = this.work;

    assertDefined(
      run,
      "This sim ECS container binding consumes a queue or serves requests, " +
        "so it has no run handler. Create a service from the task definition " +
        "to have Yulin poll the queue or send the container a request.",
    );

    await run();
  }

  private refuseTargetlessBinding(): void {
    if (this.repositoryTarget !== undefined) {
      return;
    }

    if (
      this.family === undefined ||
      this.family === "" ||
      this.containerName === undefined ||
      this.containerName === ""
    ) {
      throw new Error(
        "Invalid sim ECS container binding: a binding targets a container " +
          "either by family and containerName, or by imageRepository.",
      );
    }
  }
}
