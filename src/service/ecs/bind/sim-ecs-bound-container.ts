import { SimCfnImageRepositoryTarget } from "../../cloudformation/bind/validate/sim-cfn-image-repository-target.js";
import type { SimEcsContainerDefinition } from "../task-definition/container/sim-ecs-container-definition.js";
import type {
  SimEcsContainerBinding,
  SimEcsContainerRunHandler,
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

  private readonly run: SimEcsContainerRunHandler;
  private readonly repositoryTarget: SimCfnImageRepositoryTarget | undefined;

  constructor(binding: SimEcsContainerBinding) {
    this.family = binding.family;
    this.containerName = binding.containerName;
    this.imageRepository = binding.imageRepository;
    this.repositoryTarget = SimEcsBoundContainer.targetFor(
      binding.imageRepository,
    );
    this.run = SimEcsBoundContainer.runHandler(binding);

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
   * The run handler this binding supplied.
   *
   * An HTTP binding is refused rather than held. The shape it takes is
   * settled, so a service container behind a load balancer will not have to
   * renegotiate it, but nothing serves one yet and a binding that is never
   * called is worse than one that says so.
   */
  private static runHandler(
    binding: SimEcsContainerBinding,
  ): SimEcsContainerRunHandler {
    if (binding.http !== undefined) {
      throw new Error(
        "Invalid sim ECS container binding: an http handler is not simulated " +
          "yet, since nothing serves a container. Bind a run handler and run " +
          "the task with RunTask.",
      );
    }

    if (typeof binding.run !== "function") {
      throw new TypeError(
        "Invalid sim ECS container binding: a binding needs a run handler, " +
          "which is the function the container runs.",
      );
    }

    return binding.run;
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
   */
  async runHandler(): Promise<void> {
    await this.run();
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
