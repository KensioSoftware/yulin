import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import { simAwsRunAsContext } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimEcsContainerBindings } from "../../bind/sim-ecs-container-bindings.js";
import type { SimEcsContainerDefinition } from "../../task-definition/container/sim-ecs-container-definition.js";
import type { SimEcsTask } from "../sim-ecs-task.js";
import { SimEcsContainerEnvironment } from "./sim-ecs-container-environment.js";
import type { SimEcsTaskOverrides } from "./sim-ecs-task-overrides.js";

/**
 * What a container with no executable binding records instead of running.
 */
const notSimulatedReason =
  "Not simulated: no executable binding matches this container, so Yulin " +
  "did not run it.";

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
 * A task definition declaring no task Role leaves the caller alone. There is
 * no ambient identity to give the handler, and inventing one would let a call
 * through that real ECS would have had no credentials for.
 *
 * A handler that throws stops its container with a non-zero exit code and the
 * message as its reason, rather than failing the request that started the
 * task. Nothing is watching a `RunTask` call by the time a container fails on
 * real ECS either.
 */
export class SimEcsContainerRunner {
  private readonly bindings: SimEcsContainerBindings;
  private readonly overrides: SimEcsTaskOverrides;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly taskRoleArn: string | undefined;
  private readonly regionName: string;

  constructor(properties: SimEcsContainerRunnerProperties) {
    this.bindings = properties.bindings;
    this.overrides = properties.overrides;
    this.runAsOwner = properties.runAsOwner;
    this.taskRoleArn = properties.taskRoleArn;
    this.regionName = properties.regionName;
  }

  /**
   * What a container reports as the reason it stopped.
   */
  private static reasonFor(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  /**
   * Run one declared container of a task, recording how it ended.
   */
  async run(
    task: SimEcsTask,
    declared: SimEcsContainerDefinition,
  ): Promise<void> {
    const container = task.container(declared.name);
    const bound = this.bindings.find(task.family, declared);

    if (bound === undefined) {
      container.notSimulated(notSimulatedReason);
      return;
    }

    container.start();

    try {
      await this.asTaskRole(async () => {
        await this.environmentFor(declared).runWith(async () => {
          await bound.runHandler();
        });
      });
      container.exited();
    } catch (error) {
      container.failedWith(SimEcsContainerRunner.reasonFor(error));
    }
  }

  private environmentFor(
    declared: SimEcsContainerDefinition,
  ): SimEcsContainerEnvironment {
    return new SimEcsContainerEnvironment({
      regionName: this.regionName,
      declared: declared.environment,
      overridden: this.overrides.environmentFor(declared.name),
    });
  }

  private async asTaskRole<T>(run: () => Promise<T>): Promise<T> {
    if (this.taskRoleArn === undefined) {
      return await run();
    }

    return await simAwsRunAsContext.run(
      this.runAsOwner,
      { kind: "arn", arn: this.taskRoleArn },
      run,
    );
  }
}
