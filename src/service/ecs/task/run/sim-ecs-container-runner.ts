import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import { simAwsRunAsContext } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimEcsContainerBindings } from "../../bind/sim-ecs-container-bindings.js";
import type { SimEcsContainerDefinition } from "../../task-definition/container/sim-ecs-container-definition.js";
import type { SimEcsTask } from "../sim-ecs-task.js";
import { SimEcsContainerEnvironments } from "./sim-ecs-container-environments.js";
import {
  simEcsConsumingContainerReason,
  simEcsContainerFailureReason,
  simEcsNotSimulatedContainerReason,
} from "./sim-ecs-container-reason.js";
import type { SimEcsTaskOverrides } from "./sim-ecs-task-overrides.js";
import { simEcsTaskPrincipal } from "./sim-ecs-task-principal.js";

interface SimEcsContainerRunnerProperties {
  readonly bindings: SimEcsContainerBindings;
  readonly overrides: SimEcsTaskOverrides;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly taskRoleArn: string | undefined;
  readonly regionName: string;
}

/**
 * Runs one container of a simulated task, if anything is bound to it.
 *
 * While the handler runs, the task Role is the ambient simulated caller for
 * the owning SimAws instance, so simulated AWS operations the handler performs
 * are authorized as the task Role. That is what a real task does with the
 * credentials its agent hands the container, and it is the same thing a sim
 * Lambda function does with its execution Role.
 *
 * A task definition declaring no task Role runs anonymously. A real task
 * without one has no credentials of its own, and taking the identity of
 * whoever called `RunTask` would let a container through with permissions the
 * deployed one would not have.
 *
 * A handler that throws stops its container with a non-zero exit code and the
 * message as its reason, rather than failing the request that started the
 * task. Nothing is watching a `RunTask` call by the time a container fails on
 * real ECS either.
 *
 * A container's secrets arrive here already resolved. They were read as the
 * task execution Role before any container of the task started, so nothing in
 * this class reads a secret store, and by the time it runs there is nothing
 * left that could fail on one.
 */
export class SimEcsContainerRunner {
  private readonly bindings: SimEcsContainerBindings;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly taskRoleArn: string | undefined;
  private readonly environments: SimEcsContainerEnvironments;

  constructor(properties: SimEcsContainerRunnerProperties) {
    this.bindings = properties.bindings;
    this.runAsOwner = properties.runAsOwner;
    this.taskRoleArn = properties.taskRoleArn;
    this.environments = new SimEcsContainerEnvironments(properties);
  }

  /**
   * Run one declared container of a task, recording how it ended.
   */
  async run(
    task: SimEcsTask,
    declared: SimEcsContainerDefinition,
    secrets: Record<string, string>,
  ): Promise<void> {
    const container = task.container(declared.name);
    const bound = this.bindings.find(task.family, declared);

    if (bound === undefined) {
      container.neverStarted(simEcsNotSimulatedContainerReason);
      return;
    }

    if (bound.consumes !== undefined) {
      container.neverStarted(simEcsConsumingContainerReason);
      return;
    }

    container.start();

    try {
      await this.asTaskRole(async () => {
        await this.environments.for(declared, secrets).runWith(async () => {
          await bound.runHandler();
        });
      });
      container.exited();
    } catch (error) {
      container.failedWith(simEcsContainerFailureReason(error));
    }
  }

  /**
   * Run a container's handler as the task Role.
   *
   * The `RunTask` caller's ambient principal is still set while the background
   * work that runs the containers happens, so a task definition with no task
   * Role runs anonymously rather than inheriting it: a test would otherwise
   * pass on permissions the deployed task has no credentials for.
   */
  private async asTaskRole<T>(run: () => Promise<T>): Promise<T> {
    return await simAwsRunAsContext.run(
      this.runAsOwner,
      simEcsTaskPrincipal(this.taskRoleArn),
      run,
    );
  }
}
