import { RunTaskCommand } from "@aws-sdk/client-ecs";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const workerImage = "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1";
const checkoutImage = "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:1";

const twoFamilies = {
  Resources: {
    OrdersCluster: {
      Type: "AWS::ECS::Cluster",
      Properties: { ClusterName: "orders" },
    },
    WorkerTaskDefinition: {
      Type: "AWS::ECS::TaskDefinition",
      Properties: {
        Family: "orders-worker",
        ContainerDefinitions: [{ Name: "app", Image: workerImage }],
      },
    },
    CheckoutTaskDefinition: {
      Type: "AWS::ECS::TaskDefinition",
      Properties: {
        Family: "orders-checkout",
        ContainerDefinitions: [{ Name: "app", Image: checkoutImage }],
      },
    },
  },
};

describe("ECS CloudFormation binding targets", () => {
  it("binds only the task definition a binding targets", async () => {
    // Given a stack declaring two task definitions, each with a container
    // called app, and a binding naming one of them.
    const simAws = new SimAws();
    let runs = 0;

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: twoFamilies,
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

    // When a task is run from the family the binding did not name.
    await simAws.ecs().runTask(
      new RunTaskCommand({
        cluster: "orders",
        taskDefinition: "orders-checkout",
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then nothing ran, because the binding belongs to the other family.
    assertIdentical(runs, 0);

    // And when a task is run from the family it did name, the handler runs.
    await simAws.ecs().runTask(
      new RunTaskCommand({
        cluster: "orders",
        taskDefinition: "orders-worker",
      }),
    );

    await simAws.backgroundTasksComplete();

    assertIdentical(runs, 1);
  });

  it("binds a task definition by the family CloudFormation generated", async () => {
    // Given a task definition the template names no family for, so the family
    // is the one CloudFormation would have generated.
    const simAws = new SimAws();
    let runs = 0;

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersCluster: {
            Type: "AWS::ECS::Cluster",
            Properties: { ClusterName: "orders" },
          },
          WorkerTaskDefinition: {
            Type: "AWS::ECS::TaskDefinition",
            Properties: {
              ContainerDefinitions: [{ Name: "app", Image: workerImage }],
            },
          },
        },
      },
      bindings: [
        {
          family: "orders-stack-WorkerTaskDefinition",
          containerName: "app",
          run: () => {
            runs += 1;
          },
        },
      ],
    });

    await stack.waitForDeployComplete();

    // When a task is run from it.
    await simAws.ecs().runTask(
      new RunTaskCommand({
        cluster: "orders",
        taskDefinition: "orders-stack-WorkerTaskDefinition",
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then the handler ran, so a binding can name a family the template did
    // not.
    assertIdentical(runs, 1);
  });

  it("refuses a Resource binding naming no task definition of the stack", async () => {
    // Given a binding naming a logical ID the stack does not hold.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment is refused naming the
    // binding.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: twoFamilies,
        bindings: [
          { logicalId: "PickingTaskDefinition", run: () => undefined },
        ],
      });
    });

    assertStringIncludes(
      error.message,
      'container binding for logicalId "PickingTaskDefinition"',
    );
  });

  it("refuses a repository binding no container runs an image from", async () => {
    // Given a binding naming a repository, and a container that declares no
    // image for it to match, which real ECS would refuse the registration of.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment is refused naming the
    // repository rather than registering a task definition that could never
    // run.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            WorkerTaskDefinition: {
              Type: "AWS::ECS::TaskDefinition",
              Properties: {
                Family: "orders-worker",
                ContainerDefinitions: [{ Name: "app" }],
              },
            },
          },
        },
        bindings: [
          {
            imageRepository:
              "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker",
            run: () => undefined,
          },
        ],
      });
    });

    assertStringIncludes(
      error.message,
      'container binding for imageRepository "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker"',
    );
  });

  it("refuses a repository binding against a malformed container list", async () => {
    // Given a template whose ContainerDefinitions is one container rather than
    // a list of them, and a binding naming a repository.
    const simAws = new SimAws();

    // When the template is deployed, then the binding is refused first, since
    // a Stack checks its bindings as it is built and there is no container
    // list there to match against.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            WorkerTaskDefinition: {
              Type: "AWS::ECS::TaskDefinition",
              Properties: {
                Family: "orders-worker",
                ContainerDefinitions: { Name: "app", Image: workerImage },
              },
            },
          },
        },
        bindings: [
          {
            imageRepository:
              "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker",
            run: () => undefined,
          },
        ],
      });
    });

    assertStringIncludes(error.message, "does not resolve to a Resource");
  });

  it("registers nothing when a binding is refused", async () => {
    // Given a binding naming a container the task definition does not declare.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment is refused.
    await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: twoFamilies,
        bindings: [
          {
            logicalId: "WorkerTaskDefinition",
            containerName: "worker",
            run: () => undefined,
          },
        ],
      });
    });

    // And no revision is left behind, because the binding is read before the
    // registration is made rather than after it. A revision is immutable once
    // registered, so one made here could only have been deregistered.
    const error = assertThrowsError(() =>
      simAws.ecs().taskDefinition("orders-worker"),
    );

    assertStringIncludes(error.message, "orders-worker");
  });

  it("keeps a Lambda binding and a container binding apart", async () => {
    // Given one deployment binding both a Lambda function and a container, the
    // Lambda one naming the task definition's logical ID is what would go
    // wrong if the two kinds were not told apart.
    const simAws = new SimAws();
    let containerRuns = 0;

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...twoFamilies.Resources,
          OrdersFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "orders",
              Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
            },
          },
        },
      },
      bindings: [
        { functionName: "orders", handler: () => "ran the function" },
        {
          logicalId: "WorkerTaskDefinition",
          run: () => {
            containerRuns += 1;
          },
        },
      ],
    });

    await stack.waitForDeployComplete();

    // When a task is run from the bound task definition.
    await simAws.ecs().runTask(
      new RunTaskCommand({
        cluster: "orders",
        taskDefinition: "orders-worker",
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then the container ran its own handler, and invoking the function runs
    // the handler its own binding supplied.
    assertIdentical(containerRuns, 1);

    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }));

    assertIdentical(invoked.StatusCode, 200);
    assertStringIncludes(
      Buffer.from(invoked.Payload ?? new Uint8Array()).toString(),
      "ran the function",
    );
  });
});
