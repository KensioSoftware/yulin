import {
  CreateClusterCommand,
  CreateServiceCommand,
  DeleteClusterCommand,
  DeleteServiceCommand,
  DescribeClustersCommand,
  DescribeTaskDefinitionCommand,
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";
import { SimEcsAccessDeniedException } from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";

describe("Authorizing simulated ECS requests", () => {
  it("allows a caller whose policy permits the registration", async () => {
    // Given a Role allowed to register task definitions.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Deployer", actions: ["ecs:RegisterTaskDefinition"] },
      simAws,
    );

    // When it registers one.
    const registered = await simAws.ecs().registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the registration goes through, recording who made it.
    assertIdentical(registered.taskDefinition?.revision, 1);
    assertIdentical(registered.taskDefinition.registeredBy, role.Arn);
  });

  it("refuses a caller whose policy does not permit the action", async () => {
    // Given a Role allowed to describe but not to register.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Reader", actions: ["ecs:DescribeTaskDefinition"] },
      simAws,
    );

    // When it registers a task definition.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "checkout",
          containerDefinitions: [{ name: "app", image: "checkout:1" }],
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      ),
    );

    // Then ECS refuses it as its own access denied error.
    assertInstanceOf(error, SimEcsAccessDeniedException);
    assertIdentical(error.name, "AccessDeniedException");
    assertStringIncludes(error.message, "ecs:RegisterTaskDefinition");
  });

  it("registers nothing when the caller is refused", async () => {
    // Given a Role allowed nothing in ECS.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Nobody", actions: ["s3:GetObject"] },
      simAws,
    );
    await assertThrowsErrorAsync(async () =>
      simAws.ecs().registerTaskDefinition(
        new RegisterTaskDefinitionCommand({
          family: "checkout",
          containerDefinitions: [{ name: "app", image: "checkout:1" }],
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      ),
    );

    // When the task definitions are listed as the Account root.
    const listed = await simAws
      .ecs()
      .listTaskDefinitions(new ListTaskDefinitionsCommand({}));

    // Then the refused registration left no revision behind.
    assertArrayEmpty(listed.taskDefinitionArns);
  });

  it("refuses a task definition policy naming an ARN", async () => {
    // Given a Role allowed to describe task definitions on one ARN.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Reader",
        actions: ["ecs:DescribeTaskDefinition"],
        resource: `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:task-definition/checkout:1`,
      },
      simAws,
    );
    await simAws.ecs().registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When it describes that task definition.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .describeTaskDefinition(
          new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
          { caller: { kind: "arn", arn: role.Arn } },
        ),
    );

    // Then the policy grants nothing, because real ECS gives this action no
    // resource-level permissions and evaluates it against `*`.
    assertInstanceOf(error, SimEcsAccessDeniedException);
    assertStringIncludes(error.message, "on resource: *");
  });

  it("authorizes a cluster operation against the cluster ARN", async () => {
    // Given a Role allowed to describe one cluster.
    const simAws = new SimAws();
    const clusterArn = `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:cluster/services`;
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "ClusterReader",
        actions: ["ecs:DescribeClusters"],
        resource: clusterArn,
      },
      simAws,
    );
    await simAws
      .ecs()
      .createCluster(new CreateClusterCommand({ clusterName: "services" }));
    await simAws
      .ecs()
      .createCluster(new CreateClusterCommand({ clusterName: "batch" }));

    // When it describes that cluster.
    const described = await simAws
      .ecs()
      .describeClusters(
        new DescribeClustersCommand({ clusters: ["services"] }),
        {
          caller: { kind: "arn", arn: role.Arn },
        },
      );

    // Then it is allowed, unlike the cluster its policy does not name.
    assertArrayLength(described.clusters, 1);

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .describeClusters(
          new DescribeClustersCommand({ clusters: ["batch"] }),
          {
            caller: { kind: "arn", arn: role.Arn },
          },
        ),
    );

    assertInstanceOf(error, SimEcsAccessDeniedException);
    assertStringIncludes(error.message, "cluster/batch");
  });

  it("authorizes a service operation against the service ARN", async () => {
    // Given a Role allowed to create one named service.
    const simAws = new SimAws();
    const serviceArn = `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:service/default/checkout`;
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Deployer",
        actions: ["ecs:CreateService"],
        resource: serviceArn,
      },
      simAws,
    );
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When it creates that service.
    const created = await simAws.ecs().createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 1,
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then it is allowed, and the service records who created it.
    assertIdentical(created.service?.createdBy, role.Arn);

    // And a service its policy does not name is refused.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "orders",
          taskDefinition: "checkout",
          desiredCount: 1,
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      ),
    );

    assertInstanceOf(error, SimEcsAccessDeniedException);
    assertStringIncludes(error.message, "service/default/orders");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a service deletion before finding out if it is there", async () => {
    // Given a Role allowed nothing in ECS.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Nobody", actions: ["s3:GetObject"] },
      simAws,
    );

    // When it deletes a service that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .deleteService(new DeleteServiceCommand({ service: "checkout" }), {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then the answer is the access denial, so nothing is learned about what
    // the cluster holds.
    assertInstanceOf(error, SimEcsAccessDeniedException);
    assertStringIncludes(error.message, "ecs:DeleteService");
  });

  it("refuses a cluster deletion before finding out if it is there", async () => {
    // Given a Role allowed nothing in ECS.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Nobody", actions: ["s3:GetObject"] },
      simAws,
    );

    // When it deletes a cluster that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .deleteCluster(new DeleteClusterCommand({ cluster: "services" }), {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then the answer is the access denial, so nothing is learned about what
    // the account holds.
    assertInstanceOf(error, SimEcsAccessDeniedException);
  });
});
