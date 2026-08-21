import { DescribeTasksCommand, RunTaskCommand } from "@aws-sdk/client-ecs";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";

const imageUri =
  "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:build-7";

function workerTemplate(
  containers: SimCfnTemplateValue[],
  metadata?: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: { ClusterName: "orders" },
      },
      WorkerTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        ...(metadata !== undefined && { Metadata: metadata }),
        Properties: {
          Family: "orders-worker",
          ContainerDefinitions: containers,
        },
      },
    },
  };
}

const appContainer = { Name: "app", Image: imageUri };
const logRouterContainer = {
  Name: "log-router",
  Image: "public.ecr.aws/aws-observability/aws-for-fluent-bit:stable",
};

/**
 * Run one task of the deployed family and let the simulation finish it.
 */
async function runWorkerTask(simAws: SimAws): Promise<string> {
  const run = await simAws.ecs().runTask(
    new RunTaskCommand({
      cluster: "orders",
      taskDefinition: "orders-worker",
    }),
  );

  await simAws.backgroundTasksComplete();

  const taskArn = run.tasks?.[0]?.taskArn;
  assertNonNullable(taskArn);

  return taskArn;
}

describe("ECS CloudFormation container bindings", () => {
  it("runs a container bound by family and container name", async () => {
    // Given a handler bound at deploy time to a container of a family.
    const simAws = new SimAws();
    let runs = 0;

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: workerTemplate([appContainer]),
      bindings: [
        {
          family: "orders-worker",
          containerName: "app",
          run: () => {
            runs += 1;
          },
        },
      ],
    });

    await stack.waitForDeployComplete();

    // When a task is run from the deployed task definition.
    await runWorkerTask(simAws);

    // Then the bound handler ran, in this process, as the task's container.
    assertIdentical(runs, 1);
  });

  it("runs a container bound by the task definition's logical ID", async () => {
    // Given a handler bound to the Resource rather than to the family, which
    // is what a template gives a test to name.
    const simAws = new SimAws();
    let runs = 0;

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: workerTemplate([appContainer]),
      bindings: [
        {
          logicalId: "WorkerTaskDefinition",
          run: () => {
            runs += 1;
          },
        },
      ],
    });

    await stack.waitForDeployComplete();

    // When a task is run.
    await runWorkerTask(simAws);

    // Then the one container the task definition declares ran the handler,
    // since a binding naming no container can only have meant that one.
    assertIdentical(runs, 1);
  });

  it("runs a container bound by the CDK construct ID", async () => {
    // Given a synthesized task definition carrying its CDK construct path, and
    // a binding naming the construct rather than the generated logical ID.
    const simAws = new SimAws();
    let runs = 0;

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: workerTemplate([appContainer, logRouterContainer], {
        "aws:cdk:path": "OrdersStack/WorkerTask/Resource",
      }),
      bindings: [
        {
          logicalId: "WorkerTask",
          containerName: "app",
          run: () => {
            runs += 1;
          },
        },
      ],
    });

    await stack.waitForDeployComplete();

    // When a task is run.
    await runWorkerTask(simAws);

    // Then the named container ran the handler.
    assertIdentical(runs, 1);
  });

  it("runs a container bound by its image repository", async () => {
    // Given a binding naming the repository the container's image comes from,
    // which is what covers an image tag that changes with every build.
    const simAws = new SimAws();
    let runs = 0;

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: workerTemplate([appContainer, logRouterContainer]),
      bindings: [
        {
          imageRepository:
            "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker",
          run: () => {
            runs += 1;
          },
        },
      ],
    });

    await stack.waitForDeployComplete();

    // When a task is run.
    await runWorkerTask(simAws);

    // Then the container running that image ran the handler, and the log
    // router, which runs another image, did not.
    assertIdentical(runs, 1);
  });

  it("deploys a container it cannot run, recording it as not simulated", async () => {
    // Given a task definition holding an application container and a log
    // router, with only the application bound, which is the ordinary shape of
    // a real one.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: workerTemplate([appContainer, logRouterContainer]),
      bindings: [
        {
          family: "orders-worker",
          containerName: "app",
          run: () => undefined,
        },
      ],
    });

    // Then the stack deploys rather than failing for the container Yulin
    // cannot run.
    await stack.waitForDeployComplete();

    assertIdentical(
      stack.getResource("WorkerTaskDefinition")?.status,
      "CREATE_COMPLETE",
    );

    // And when a task is run, the unbound container is recorded as not
    // simulated rather than as one that failed.
    const taskArn = await runWorkerTask(simAws);
    const described = await simAws
      .ecs()
      .describeTasks(
        new DescribeTasksCommand({ cluster: "orders", tasks: [taskArn] }),
      );

    const logRouter = described.tasks?.[0]?.containers?.[1];
    assertNonNullable(logRouter);
    assertIdentical(logRouter.name, "log-router");
    assertStringIncludes(logRouter.reason ?? "", "Not simulated");
  });

  it("refuses a binding that resolves to no Resource in the stack", async () => {
    // Given a binding naming a family the stack does not declare, which is
    // most often a container renamed in the template and not in the test.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment is refused naming the
    // binding.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: workerTemplate([appContainer]),
        bindings: [
          {
            family: "orders-checkout",
            containerName: "app",
            run: () => undefined,
          },
        ],
      });
    });

    assertStringIncludes(error.message, "orders-checkout");
    assertStringIncludes(error.message, "does not resolve to a Resource");
  });

  it("refuses a Resource binding naming a container it does not declare", async () => {
    // Given a binding naming the Resource and a container name the task
    // definition does not declare.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment is refused listing
    // the containers the revision does declare.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: workerTemplate([appContainer, logRouterContainer]),
        bindings: [
          {
            logicalId: "WorkerTaskDefinition",
            containerName: "worker",
            run: () => undefined,
          },
        ],
      });
    });

    assertStringIncludes(error.message, "which family orders-worker does not");
    assertStringIncludes(error.message, "app, log-router");
  });

  it("refuses a Resource binding with nothing to choose a container by", async () => {
    // Given a binding naming the Resource of a task definition that declares
    // more than one container, and no container name.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment is refused, since
    // there is nothing here to choose between them.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: workerTemplate([appContainer, logRouterContainer]),
        bindings: [{ logicalId: "WorkerTaskDefinition", run: () => undefined }],
      });
    });

    assertStringIncludes(error.message, "needs a containerName");
    assertStringIncludes(error.message, "declares 2 containers");
  });
});
