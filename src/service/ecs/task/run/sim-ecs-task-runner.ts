import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimEcsContainerBindings } from "../../bind/sim-ecs-container-bindings.js";
import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcsTask } from "../sim-ecs-task.js";
import { SimEcsContainerRunner } from "./sim-ecs-container-runner.js";
import type { SimEcsTaskOverrides } from "./sim-ecs-task-overrides.js";
import { simEcsTaskStopOutcome } from "./sim-ecs-task-stop-outcome.js";

interface SimEcsTaskRunnerProperties {
  readonly bindings: SimEcsContainerBindings;
  readonly background: BackgroundScheduler;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly regionName: string;
}

interface SimEcsTaskRunProperties {
  readonly task: SimEcsTask;
  readonly taskDefinition: SimEcsTaskDefinition;
  readonly overrides: SimEcsTaskOverrides;
}

/**
 * Runs a simulated ECS task's containers in the background.
 *
 * `RunTask` answers before any of this happens, as real ECS answers with a
 * task that has not started yet, so a test reads what ran once the simulator's
 * background work is complete.
 *
 * Containers run one after another in the order the task definition declares
 * them. Real containers of a task run alongside each other, and `dependsOn` is
 * what orders them there; running them in order here keeps what a test sees
 * deterministic, and nothing in this process gains from overlapping in-process
 * handlers.
 */
export class SimEcsTaskRunner {
  private readonly bindings: SimEcsContainerBindings;
  private readonly background: BackgroundScheduler;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly regionName: string;

  constructor(properties: SimEcsTaskRunnerProperties) {
    this.bindings = properties.bindings;
    this.background = properties.background;
    this.runAsOwner = properties.runAsOwner;
    this.regionName = properties.regionName;
  }

  /**
   * Schedule a task's containers to run, and the task to stop after them.
   */
  start(properties: SimEcsTaskRunProperties): void {
    this.background.schedule(async () => {
      await this.run(properties);
    });
  }

  private async run(properties: SimEcsTaskRunProperties): Promise<void> {
    const { task, taskDefinition } = properties;
    const containerRunner = this.containerRunner(properties);

    task.start(this.background.now());

    for (const declared of taskDefinition.containers.all()) {
      if (task.isStopRequested) {
        break;
      }

      // Containers run in declaration order, so this awaits inside the loop
      // rather than starting them all at once.
      // oxlint-disable-next-line no-await-in-loop
      await containerRunner.run(task, declared);
    }

    task.stop({ at: this.background.now(), ...simEcsTaskStopOutcome(task) });
  }

  /**
   * What runs this task's containers, built once for the whole run.
   *
   * The task Role comes from the `RunTask` override where the request made
   * one, and from the task definition otherwise, which is the order real ECS
   * applies them in.
   */
  private containerRunner(
    properties: SimEcsTaskRunProperties,
  ): SimEcsContainerRunner {
    const { taskDefinition, overrides } = properties;

    return new SimEcsContainerRunner({
      bindings: this.bindings,
      overrides,
      runAsOwner: this.runAsOwner,
      taskRoleArn: overrides.taskRoleArn ?? taskDefinition.settings.taskRoleArn,
      regionName: this.regionName,
    });
  }
}
