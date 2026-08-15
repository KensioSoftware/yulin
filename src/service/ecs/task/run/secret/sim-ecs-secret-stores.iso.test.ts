import {
  CreateClusterCommand,
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { BackgroundTasks } from "../../../../../util/background/background.js";
import { SimEcs } from "../../../sim-ecs.js";

describe("A simulated ECS that reaches no secret store", () => {
  it("stops a task declaring a secret rather than running it without one", async () => {
    // Given simulated ECS built on its own, so there is no simulated Secrets
    // Manager or Parameter Store around it.
    const background = new BackgroundTasks();
    const ecs = new SimEcs({ background });
    await ecs.createCluster(new CreateClusterCommand({}));

    let runs = 0;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        runs += 1;
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        executionRoleArn: "arn:aws:iam::111111111111:role/OrdersExecutionRole",
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            secrets: [{ name: "DB_PASSWORD", valueFrom: "/orders/db" }],
          },
        ],
      }),
    );

    // When a task is run.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "orders-worker" }),
    );
    await background.complete();

    // Then it says what is missing, rather than starting a container without
    // the variable it declared.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    const task = described.tasks?.[0];
    assertNonNullable(task);

    assertIdentical(runs, 0);
    assertIdentical(task.stopCode, "TaskFailedToStart");
    assertStringIncludes(
      task.stoppedReason ?? "",
      "reaches no simulated Secrets Manager or SSM Parameter Store",
    );
  });
});
