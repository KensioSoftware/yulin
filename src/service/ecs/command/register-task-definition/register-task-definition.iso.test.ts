import { RegisterTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";

describe("ECS RegisterTaskDefinitionCommand", () => {
  it("numbers the revisions of a family from one", async () => {
    // Given simulated ECS in a known account and region.
    const simEcs = new SimAws()
      .account("555555555555")
      .region("eu-west-1")
      .ecs();

    // When the same family is registered twice.
    const first = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );
    const second = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:2" }],
      }),
    );

    // Then the revisions are 1 and 2, and each ARN names its own revision.
    assertIdentical(first.taskDefinition?.revision, 1);
    assertIdentical(second.taskDefinition?.revision, 2);
    assertIdentical(
      first.taskDefinition.taskDefinitionArn,
      "arn:aws:ecs:eu-west-1:555555555555:task-definition/checkout:1",
    );
    assertIdentical(
      second.taskDefinition.taskDefinitionArn,
      "arn:aws:ecs:eu-west-1:555555555555:task-definition/checkout:2",
    );
    assertIdentical(second.taskDefinition.status, "ACTIVE");
  });

  it("numbers each family separately", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When two families are registered.
    await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );
    const other = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "billing",
        containerDefinitions: [{ name: "app", image: "billing:1" }],
      }),
    );

    // Then the second family starts at revision 1 of its own.
    assertIdentical(other.taskDefinition?.revision, 1);
  });

  it("stores container definitions as they were declared", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a task definition declares a container in full.
    const registered = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [
          {
            name: "app",
            image: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:1",
            essential: true,
            cpu: 256,
            memory: 512,
            command: ["node", "server.js"],
            portMappings: [{ containerPort: 8080, protocol: "tcp" }],
            environment: [{ name: "LOG_LEVEL", value: "debug" }],
            secrets: [
              {
                name: "DB_PASSWORD",
                valueFrom:
                  "arn:aws:secretsmanager:eu-west-2:111111111111:secret:db",
              },
            ],
          },
        ],
      }),
    );

    // Then every part of the declaration is reported back.
    const container = registered.taskDefinition?.containerDefinitions?.[0];
    assertObjectMatches(container ?? {}, {
      name: "app",
      image: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:1",
      essential: true,
      cpu: 256,
      memory: 512,
    });
    assertIdentical(container?.command?.[1], "server.js");
    assertIdentical(container.portMappings?.[0]?.containerPort, 8080);
    assertIdentical(container.environment?.[0]?.value, "debug");
    assertIdentical(container.secrets?.[0]?.name, "DB_PASSWORD");
  });

  it("stores a container Yulin could never run just the same", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a task definition declares a log router beside its application.
    const registered = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [
          { name: "app", image: "checkout:1" },
          {
            name: "log-router",
            image: "amazon/aws-for-fluent-bit:stable",
            essential: false,
          },
        ],
      }),
    );

    // Then both containers are held, because nothing here reads an image.
    assertArrayLength(registered.taskDefinition?.containerDefinitions, 2);
    assertIdentical(
      registered.taskDefinition.containerDefinitions[1].image,
      "amazon/aws-for-fluent-bit:stable",
    );
  });

  it("reports the settings the registration declared", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a task definition declares sizing, roles and compatibility.
    const registered = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
        cpu: "512",
        memory: "1024",
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        executionRoleArn: "arn:aws:iam::111111111111:role/TaskExecution",
        taskRoleArn: "arn:aws:iam::111111111111:role/Checkout",
        runtimePlatform: { cpuArchitecture: "ARM64" },
      }),
    );

    // Then each one is reported as it was declared.
    assertObjectMatches(registered.taskDefinition ?? {}, {
      cpu: "512",
      memory: "1024",
      networkMode: "awsvpc",
      executionRoleArn: "arn:aws:iam::111111111111:role/TaskExecution",
      taskRoleArn: "arn:aws:iam::111111111111:role/Checkout",
    });
    assertIdentical(
      registered.taskDefinition?.requiresCompatibilities?.[0],
      "FARGATE",
    );
    assertIdentical(
      registered.taskDefinition.runtimePlatform?.cpuArchitecture,
      "ARM64",
    );
  });

  it("reports the storage and process settings too", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a task definition declares volumes, placement and process modes.
    const registered = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
        volumes: [{ name: "scratch", host: { sourcePath: "/tmp/scratch" } }],
        placementConstraints: [{ type: "memberOf", expression: "attribute:x" }],
        ephemeralStorage: { sizeInGiB: 40 },
        proxyConfiguration: { type: "APPMESH", containerName: "envoy" },
        pidMode: "task",
        ipcMode: "task",
      }),
    );

    // Then each one is reported as it was declared.
    assertIdentical(registered.taskDefinition?.volumes?.[0]?.name, "scratch");
    assertIdentical(
      registered.taskDefinition.placementConstraints?.[0]?.type,
      "memberOf",
    );
    assertIdentical(registered.taskDefinition.ephemeralStorage?.sizeInGiB, 40);
    assertIdentical(
      registered.taskDefinition.proxyConfiguration?.containerName,
      "envoy",
    );
    assertIdentical(registered.taskDefinition.pidMode, "task");
    assertIdentical(registered.taskDefinition.ipcMode, "task");
  });

  it("leaves out a setting the registration did not declare", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a task definition declares nothing but its family and container.
    const registered = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // Then nothing is reported in place of what was not declared.
    assertUndefined(registered.taskDefinition?.networkMode);
    assertUndefined(registered.taskDefinition?.cpu);
    assertUndefined(registered.taskDefinition?.deregisteredAt);
  });

  it("reports the tags the registration carried", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a task definition is registered with tags.
    const registered = await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
        tags: [{ key: "team", value: "payments" }],
      }),
    );

    // Then the tags come back beside the task definition.
    assertArrayLength(registered.tags, 1);
    assertIdentical(registered.tags[0].value, "payments");
  });

  it("records when and by whom a revision was registered", async () => {
    // Given simulated ECS with a stopped clock.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-03-04T05:06:07Z")),
    });

    // When a task definition is registered by the account root.
    const registered = await simAws.ecs().registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // Then the revision records the simulation's time and the caller.
    assertIdentical(
      registered.taskDefinition?.registeredAt?.toISOString(),
      "2026-03-04T05:06:07.000Z",
    );
    assertIdentical(
      registered.taskDefinition.registeredBy,
      `arn:aws:iam::${simAws.defaultAccountId}:root`,
    );
  });

  it("keeps the families of one account and region to themselves", async () => {
    // Given two account and region scopes.
    const simAws = new SimAws();
    const here = simAws.account("111111111111").region("eu-west-2").ecs();
    const elsewhere = simAws.account("222222222222").region("eu-west-2").ecs();

    // When the same family is registered in each of them.
    const first = await here.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );
    const second = await elsewhere.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // Then each starts its own revision numbering under its own ARN.
    assertIdentical(first.taskDefinition?.revision, 1);
    assertIdentical(second.taskDefinition?.revision, 1);
    assertIdentical(
      second.taskDefinition.taskDefinitionArn,
      "arn:aws:ecs:eu-west-2:222222222222:task-definition/checkout:1",
    );
  });
});
