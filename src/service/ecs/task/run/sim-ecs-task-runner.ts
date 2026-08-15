import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimEcsContainerBindings } from "../../bind/sim-ecs-container-bindings.js";
import type { SimEcsResolvedSecrets } from "./secret/sim-ecs-resolved-secrets.js";
import type { SimEcsSecretStores } from "./secret/sim-ecs-secret-stores.js";
import { SimEcsTaskSecrets } from "./secret/sim-ecs-task-secrets.js";
import { SimEcsContainerRunner } from "./sim-ecs-container-runner.js";
import type { SimEcsTaskRun } from "./sim-ecs-task-run.type.js";
import { simEcsTaskStopOutcome } from "./sim-ecs-task-stop-outcome.js";

interface SimEcsTaskRunnerProperties {
  readonly bindings: SimEcsContainerBindings;
  readonly background: BackgroundScheduler;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly regionName: string;
  readonly secretStores: SimEcsSecretStores;
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
 *
 * The task's container secrets are resolved before any of that, while the task
 * is still provisioning, which is when a real task agent pulls them. A secret
 * it cannot read stops the task before it ever reaches `RUNNING`, so no bound
 * handler runs on a task that was never going to have what it declared.
 */
export class SimEcsTaskRunner {
  private readonly bindings: SimEcsContainerBindings;
  private readonly background: BackgroundScheduler;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly regionName: string;
  private readonly secrets: SimEcsTaskSecrets;

  constructor(properties: SimEcsTaskRunnerProperties) {
    this.bindings = properties.bindings;
    this.background = properties.background;
    this.runAsOwner = properties.runAsOwner;
    this.regionName = properties.regionName;
    this.secrets = new SimEcsTaskSecrets({ stores: properties.secretStores });
  }

  /**
   * Schedule a task's containers to run, and the task to stop after them.
   */
  start(properties: SimEcsTaskRun): void {
    this.background.schedule(async () => {
      await this.run(properties);
    });
  }

  private async run(properties: SimEcsTaskRun): Promise<void> {
    const { task, taskDefinition } = properties;
    const secrets = await this.secrets.resolve(taskDefinition);

    if (!secrets.isResolved) {
      task.failToStart(this.background.now(), secrets.failureReason);
      return;
    }

    task.start(this.background.now());
    await this.runContainers(properties, secrets);
    task.stop({ at: this.background.now(), ...simEcsTaskStopOutcome(task) });
  }

  private async runContainers(
    properties: SimEcsTaskRun,
    secrets: SimEcsResolvedSecrets,
  ): Promise<void> {
    const { task, taskDefinition } = properties;
    const containerRunner = this.containerRunner(properties);

    for (const declared of taskDefinition.containers.all()) {
      if (task.isStopRequested) {
        break;
      }

      // Containers run in declaration order, so this awaits inside the loop
      // rather than starting them all at once.
      // oxlint-disable-next-line no-await-in-loop
      await containerRunner.run(
        task,
        declared,
        secrets.forContainer(declared.name),
      );
    }
  }

  /**
   * What runs this task's containers, built once for the whole run.
   *
   * The task Role comes from the `RunTask` override where the request made
   * one, and from the task definition otherwise, which is the order real ECS
   * applies them in.
   */
  private containerRunner(properties: SimEcsTaskRun): SimEcsContainerRunner {
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
