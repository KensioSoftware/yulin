import {
  requiredSimEcsContainerImage,
  requiredSimEcsContainerName,
} from "./sim-ecs-container-identity.js";
import type {
  SimEcsContainerDependency,
  SimEcsHealthCheck,
  SimEcsKeyValuePair,
  SimEcsLogConfiguration,
  SimEcsMountPoint,
  SimEcsPortMapping,
  SimEcsSecret,
  SimEcsUlimit,
} from "./sim-ecs-container-parts.js";
import { simEcsContainerPorts } from "./sim-ecs-container-ports.js";

/**
 * Minimal structural sim ECS container definition.
 *
 * These are the fields a described task definition reports under a name of
 * their own. A definition may carry more than this, and whatever it carries is
 * stored and reported unchanged, because a task definition is a declaration
 * rather than something this simulation reads the meaning out of.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDefinition.html
 */
export interface SimEcsContainerDefinitionType {
  readonly name?: string | undefined;
  readonly image?: string | undefined;
  readonly cpu?: number | undefined;
  readonly memory?: number | undefined;
  readonly memoryReservation?: number | undefined;
  readonly essential?: boolean | undefined;
  readonly command?: readonly string[] | undefined;
  readonly entryPoint?: readonly string[] | undefined;
  readonly workingDirectory?: string | undefined;
  readonly user?: string | undefined;
  readonly environment?: readonly SimEcsKeyValuePair[] | undefined;
  readonly secrets?: readonly SimEcsSecret[] | undefined;
  readonly portMappings?: readonly SimEcsPortMapping[] | undefined;
  readonly mountPoints?: readonly SimEcsMountPoint[] | undefined;
  readonly dependsOn?: readonly SimEcsContainerDependency[] | undefined;
  readonly healthCheck?: SimEcsHealthCheck | undefined;
  readonly logConfiguration?: SimEcsLogConfiguration | undefined;
  readonly ulimits?: readonly SimEcsUlimit[] | undefined;
  readonly dockerLabels?: Readonly<Record<string, string>> | undefined;
  readonly readonlyRootFilesystem?: boolean | undefined;
  readonly privileged?: boolean | undefined;
  readonly startTimeout?: number | undefined;
  readonly stopTimeout?: number | undefined;
}

/**
 * One container declared by a simulated ECS task definition.
 *
 * The declaration is kept as it was made. Yulin never looks inside a container
 * image, so there is nothing here to read a definition's meaning out of: the
 * image URI is an identifier, and the rest is configuration a running task
 * would use. Storing it whole is what lets a test assert that what a template
 * or a CDK construct declared is what ECS holds.
 */
export class SimEcsContainerDefinition {
  public readonly name: string;
  public readonly image: string;

  private readonly declared: SimEcsContainerDefinitionType;

  constructor(declared: SimEcsContainerDefinitionType) {
    this.name = requiredSimEcsContainerName(declared.name);
    this.image = requiredSimEcsContainerImage(declared.image, this.name);
    // Copied rather than held by reference, since the caller owns the object
    // it passed in and may reuse it for the next registration.
    this.declared = structuredClone(declared);
  }

  /**
   * The environment variables this container declared.
   *
   * These are what a bound handler sees in `process.env` while the container
   * runs, before any override the `RunTask` request made.
   */
  get environment(): readonly SimEcsKeyValuePair[] {
    return this.declared.environment ?? [];
  }

  /**
   * The secrets this container declared.
   *
   * Each one names a store to read a value from when the task starts, and the
   * variable that value becomes. They are resolved as the task execution Role
   * before any container runs, so a container reads them through `process.env`
   * alongside its declared `environment`.
   */
  get secrets(): readonly SimEcsSecret[] {
    return this.declared.secrets ?? [];
  }

  /**
   * The ports this container declared it listens on.
   *
   * This is the one part of a container definition beyond its name and image
   * whose meaning anything here reads, and what reads it is a load balancer
   * working out which container of a task its registration meant.
   */
  get containerPorts(): readonly number[] {
    return simEcsContainerPorts(this.declared.portMappings);
  }

  /**
   * This container as a described task definition reports it.
   */
  toOutput(): SimEcsContainerDefinitionType {
    return structuredClone(this.declared);
  }
}
