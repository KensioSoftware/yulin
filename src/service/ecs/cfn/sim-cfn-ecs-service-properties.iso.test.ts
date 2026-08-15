import { DescribeServicesCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";

const imageUri = "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1";

const targetGroupArn =
  "arn:aws:elasticloadbalancing:us-east-1:888888888888:targetgroup/orders/73e2d6bc";

/**
 * The cluster and task definition a service needs before it is anything.
 */
const workerResources: Record<string, SimCfnTemplateValue> = {
  OrdersCluster: {
    Type: "AWS::ECS::Cluster",
    Properties: { ClusterName: "orders" },
  },
  WorkerTaskDefinition: {
    Type: "AWS::ECS::TaskDefinition",
    Properties: {
      Family: "orders-worker",
      ContainerDefinitions: [{ Name: "app", Image: imageUri }],
    },
  },
};

/**
 * A stack whose service declares whatever the test is about.
 */
function serviceTemplate(
  properties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      ...workerResources,
      WorkerService: {
        Type: "AWS::ECS::Service",
        Properties: {
          Cluster: { Ref: "OrdersCluster" },
          TaskDefinition: { Ref: "WorkerTaskDefinition" },
          ...properties,
        },
      },
    },
  };
}

describe("AWS::ECS::Service properties", () => {
  it("names an unnamed service after the stack and logical ID", async () => {
    // Given a template declaring a service without a name or a desired count,
    // which real CloudFormation fills both of in.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: serviceTemplate({}),
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the service is named from the stack and the logical ID, without the
    // random part real CloudFormation adds, and it keeps the one task real
    // CloudFormation gives a new service that declares no count.
    const service = simAws
      .ecs()
      .service("orders-stack-WorkerService", "orders");

    assertTrue(service.isActive());
    assertIdentical(service.desiredCount, 1);
  });

  it("takes a desired count written as text", async () => {
    // Given a template whose DesiredCount is the text of a number, which is
    // what a String Parameter resolves to.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: serviceTemplate({
        ServiceName: "orders-worker",
        DesiredCount: "3",
      }),
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the service keeps that many tasks running.
    assertIdentical(
      simAws.ecs().service("orders-worker", "orders").desiredCount,
      3,
    );
  });

  it("records the load balancers a service declares", async () => {
    // Given a template whose service declares a load balancer target group,
    // which nothing here routes to yet.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: serviceTemplate({
        ServiceName: "orders-worker",
        DesiredCount: 1,
        LoadBalancers: [
          {
            TargetGroupArn: targetGroupArn,
            ContainerName: "app",
            ContainerPort: 8080,
          },
        ],
      }),
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the declaration is readable on the simulated service, so a target
    // group can find the service and the container that answer for it.
    const service = simAws.ecs().service("orders-worker", "orders");

    assertArrayLength(service.loadBalancers, 1);
    assertIdentical(service.loadBalancers[0].targetGroupArn, targetGroupArn);
    assertIdentical(service.loadBalancers[0].containerName, "app");
    assertIdentical(service.loadBalancers[0].containerPort, 8080);

    // And DescribeServices reports it in the spelling the SDK uses.
    const described = await simAws.ecs().describeServices(
      new DescribeServicesCommand({
        cluster: "orders",
        services: ["orders-worker"],
      }),
    );

    assertIdentical(
      described.services?.[0]?.loadBalancers?.[0]?.targetGroupArn,
      targetGroupArn,
    );
  });

  it("deploys a service declaring a network, without one", async () => {
    // Given a template declaring the network and the rollout a service has,
    // which there is neither of here, and a property ECS has never had.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: serviceTemplate({
        ServiceName: "orders-worker",
        DesiredCount: 1,
        NetworkConfiguration: {
          AwsvpcConfiguration: { Subnets: ["subnet-0e1f2a3b"] },
        },
        DeploymentConfiguration: { MinimumHealthyPercent: 100 },
        Speed: "quick",
      }),
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the service is created without them, and each is recorded so a
    // reader can see what the deployed service is not doing.
    assertTrue(simAws.ecs().service("orders-worker", "orders").isActive());

    const ignored = stack.resources.get("WorkerService")?.ignoredProperties;

    assertNonNullable(ignored);
    assertArrayLength(ignored, 3);

    const reasons = ignored.map((property) => property.reason).join(" ");

    assertStringIncludes(reasons, "there is no network here");
    assertStringIncludes(
      reasons,
      "Speed is not a property simulated ECS knows about",
    );
  });

  it("refuses a desired count that is not a whole number", async () => {
    // Given a template whose DesiredCount is text that counts nothing.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails, naming the Resource and
    // the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: serviceTemplate({
          ServiceName: "orders-worker",
          DesiredCount: "as many as it takes",
        }),
      });
    });

    assertStringIncludes(error.message, "WorkerService");
    assertStringIncludes(error.message, "DesiredCount is a whole number");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a fraction of a task", async () => {
    // Given a template asking for half a task more than it can have.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the property,
    // rather than rounding to a count nothing asked for.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: serviceTemplate({
          ServiceName: "orders-worker",
          DesiredCount: 1.5,
        }),
      });
    });

    assertStringIncludes(error.message, "DesiredCount is a whole number");

    await simAws.backgroundTasksComplete();
  });

  it("refuses an attribute a service does not have", async () => {
    // Given a template reading an attribute AWS::ECS::Service has no answer
    // for.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          ...serviceTemplate({ ServiceName: "orders-worker" }),
          Outputs: {
            Nonsense: { Value: { "Fn::GetAtt": ["WorkerService", "Tasks"] } },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::ECS::Service attribute Tasks",
    );

    await simAws.backgroundTasksComplete();
  });
});
