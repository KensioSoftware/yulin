import { DescribeTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const workerContainer = {
  Name: "app",
  Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
  Essential: true,
  Cpu: 256,
  PortMappings: [{ ContainerPort: 8080, Protocol: "tcp" }],
  Environment: [{ Name: "LOG_LEVEL", Value: "debug" }],
  Secrets: [
    {
      Name: "API_KEY",
      ValueFrom: "arn:aws:secretsmanager:eu-west-2:000000000000:secret:orders",
    },
  ],
  DockerLabels: { "com.example.Team": "payments" },
  LogConfiguration: {
    LogDriver: "awslogs",
    Options: { "awslogs-group": "/ecs/orders" },
  },
};

const taskDefinitionTemplate = {
  Resources: {
    WorkerTaskDefinition: {
      Type: "AWS::ECS::TaskDefinition",
      Properties: {
        Family: "orders-worker",
        Cpu: "512",
        Memory: "1024",
        NetworkMode: "awsvpc",
        RequiresCompatibilities: ["FARGATE"],
        TaskRoleArn: { "Fn::GetAtt": ["WorkerTaskRole", "Arn"] },
        ExecutionRoleArn: { Ref: "WorkerExecutionRole" },
        ContainerDefinitions: [workerContainer],
        Tags: [{ Key: "Team", Value: "payments" }],
      },
    },
    WorkerTaskRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "orders-worker-task",
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ecs-tasks.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
      },
    },
    WorkerExecutionRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "orders-worker-execution",
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ecs-tasks.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
      },
    },
  },
  Outputs: {
    TaskDefinitionRef: { Value: { Ref: "WorkerTaskDefinition" } },
    TaskDefinitionArn: {
      Value: { "Fn::GetAtt": ["WorkerTaskDefinition", "TaskDefinitionArn"] },
    },
  },
};

describe("AWS::ECS::TaskDefinition", () => {
  it("registers a revision the template declares", async () => {
    // Given a template declaring a task definition.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: taskDefinitionTemplate,
    });

    await stack.waitForDeployComplete();

    // Then simulated ECS holds revision one of the family, and both Ref and
    // Fn::GetAtt TaskDefinitionArn answer with the ARN, revision and all.
    const taskDefinition = simAws.ecs().taskDefinition("orders-worker");

    assertIdentical(taskDefinition.revision, 1);
    assertStringIncludes(taskDefinition.taskDefinitionArn, "orders-worker:1");
    assertIdentical(
      stack.outputs.get("TaskDefinitionRef")?.value,
      taskDefinition.taskDefinitionArn,
    );
    assertIdentical(
      stack.outputs.get("TaskDefinitionArn")?.value,
      taskDefinition.taskDefinitionArn,
    );

    await simAws.backgroundTasksComplete();
  });

  it("stores the container definitions as they were declared", async () => {
    // Given a deployed task definition whose container declares more than
    // anything here reads.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: taskDefinitionTemplate,
    });

    await stack.waitForDeployComplete();

    // When the revision is described.
    const described = await simAws
      .ecs()
      .describeTaskDefinition(
        new DescribeTaskDefinitionCommand({ taskDefinition: "orders-worker" }),
      );

    // Then the container reads back in the spelling the SDK uses, with the
    // maps whose keys the template wrote left as they were written.
    const container = described.taskDefinition?.containerDefinitions?.[0];
    assertNonNullable(container);
    assertIdentical(container.name, "app");
    assertIdentical(
      container.image,
      "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
    );
    assertIdentical(container.cpu, 256);
    assertIdentical(container.portMappings?.[0]?.containerPort, 8080);
    assertIdentical(container.environment?.[0]?.name, "LOG_LEVEL");
    assertIdentical(container.secrets?.[0]?.name, "API_KEY");
    assertIdentical(
      container.logConfiguration?.options?.["awslogs-group"],
      "/ecs/orders",
    );
    assertIdentical(container.dockerLabels?.["com.example.Team"], "payments");

    await simAws.backgroundTasksComplete();
  });

  it("resolves a task Role by ARN and an execution Role by Ref", async () => {
    // Given a template naming its task Role by Fn::GetAtt Arn and its
    // execution Role by Ref, which resolves to the Role name.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: taskDefinitionTemplate,
    });

    await stack.waitForDeployComplete();

    // When the revision is read back.
    const taskDefinition = simAws.ecs().taskDefinition("orders-worker");

    // Then both are held as ARNs, so a running task attributes its AWS calls
    // to a Role rather than to a name that names nobody.
    assertIdentical(
      taskDefinition.settings.taskRoleArn,
      `arn:aws:iam::${simAws.defaultAccountId}:role/orders-worker-task`,
    );
    assertIdentical(
      taskDefinition.settings.executionRoleArn,
      `arn:aws:iam::${simAws.defaultAccountId}:role/orders-worker-execution`,
    );

    await simAws.backgroundTasksComplete();
  });

  it("reports the settings and tags the template declared", async () => {
    // Given a deployed task definition declaring what a Fargate one carries.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: taskDefinitionTemplate,
    });

    await stack.waitForDeployComplete();

    // When it is described asking for its tags.
    const described = await simAws.ecs().describeTaskDefinition(
      new DescribeTaskDefinitionCommand({
        taskDefinition: "orders-worker",
        include: ["TAGS"],
      }),
    );

    // Then the settings and the tags read back as declared.
    assertIdentical(described.taskDefinition?.cpu, "512");
    assertIdentical(described.taskDefinition.memory, "1024");
    assertIdentical(described.taskDefinition.networkMode, "awsvpc");
    assertArrayLength(described.taskDefinition.requiresCompatibilities, 1);
    assertIdentical(described.tags?.[0]?.key, "Team");

    await simAws.backgroundTasksComplete();
  });

  it("names an unnamed task definition after the stack and logical ID", async () => {
    // Given a template declaring no Family, which real CloudFormation would
    // generate one for.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          WorkerTaskDefinition: {
            Type: "AWS::ECS::TaskDefinition",
            Properties: { ContainerDefinitions: [workerContainer] },
          },
        },
        Outputs: {
          TaskDefinitionRef: { Value: { Ref: "WorkerTaskDefinition" } },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the family comes from the stack, the logical ID and a tail derived
    // from both, which the Ref a test reads carries.
    const taskDefinitionArn = stack.outputs.get("TaskDefinitionRef")?.value;

    assertStringIncludes(
      taskDefinitionArn,
      "task-definition/orders-stack-WorkerTaskDefinition-",
    );
    assertIdentical(simAws.ecs().taskDefinition(taskDefinitionArn).revision, 1);

    await simAws.backgroundTasksComplete();
  });

  it("deploys a task definition declaring fault injection, without it", async () => {
    // Given a template declaring a property RegisterTaskDefinition refuses.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          WorkerTaskDefinition: {
            Type: "AWS::ECS::TaskDefinition",
            Properties: {
              Family: "orders-worker",
              EnableFaultInjection: true,
              ContainerDefinitions: [workerContainer],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the revision is registered without it, and it is recorded rather
    // than failing the stack.
    assertIdentical(simAws.ecs().taskDefinition("orders-worker").revision, 1);

    const ignored = stack.getResource(
      "WorkerTaskDefinition",
    )?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 1);
    assertStringIncludes(
      ignored[0].reason,
      "nothing injects a fault into a simulated task",
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses container definitions that are not a list", async () => {
    // Given a template whose ContainerDefinitions is one object rather than a
    // list of them, which is an easy thing to write by hand.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            WorkerTaskDefinition: {
              Type: "AWS::ECS::TaskDefinition",
              Properties: {
                Family: "orders-worker",
                ContainerDefinitions: workerContainer,
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "WorkerTaskDefinition");
    assertStringIncludes(error.message, "ContainerDefinitions is a list");
  });

  it("refuses an attribute a task definition does not have", async () => {
    // Given a template reading an attribute AWS::ECS::TaskDefinition has no
    // answer for.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            WorkerTaskDefinition: {
              Type: "AWS::ECS::TaskDefinition",
              Properties: {
                Family: "orders-worker",
                ContainerDefinitions: [workerContainer],
              },
            },
          },
          Outputs: {
            Nonsense: {
              Value: { "Fn::GetAtt": ["WorkerTaskDefinition", "Family"] },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::ECS::TaskDefinition attribute Family",
    );
  });

  it("deregisters the revision when the stack is torn down", async () => {
    // Given a deployed task definition.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: taskDefinitionTemplate,
    });

    await stack.waitForDeployComplete();

    // When the stack is deleted.
    await stack.delete();
    await simAws.backgroundTasksComplete();

    // Then the revision is INACTIVE rather than gone, and the family it left
    // behind resolves to nothing, since nothing active is left in it.
    assertFalse(simAws.ecs().taskDefinition("orders-worker:1").isActive());

    const error = assertThrowsError(() =>
      simAws.ecs().taskDefinition("orders-worker"),
    );
    assertStringIncludes(error.message, "orders-worker");
  });
});
