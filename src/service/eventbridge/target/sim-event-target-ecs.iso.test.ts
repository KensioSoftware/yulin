import {
  ListTargetsByRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
  type Target,
} from "@aws-sdk/client-eventbridge";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../error/sim-event-bridge.error.js";

const clusterArn = "arn:aws:ecs:us-east-1:888888888888:cluster/orders";

const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";

const roleArn = "arn:aws:iam::888888888888:role/EventsRole";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

/**
 * A simulation with one rule to put targets on.
 */
async function simulationWithRule(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .eventBridge()
    .putRule(
      new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
    );

  return simAws;
}

/**
 * Put one target on the rule, answering with whatever it raised.
 */
async function refusedTarget(target: Target): Promise<Error> {
  const simAws = await simulationWithRule();

  return await assertThrowsErrorAsync(async () => {
    await simAws
      .eventBridge()
      .putTargets(new PutTargetsCommand({ Rule: "orders", Targets: [target] }));
  });
}

/**
 * An ECS target with the parameters given.
 */
function ecsTarget(parameters: Target["EcsParameters"]): Target {
  return {
    Id: "import",
    Arn: clusterArn,
    RoleArn: roleArn,
    EcsParameters: parameters,
  };
}

describe("EventBridge ECS target validation", () => {
  it("refuses an ECS ARN that names no cluster", async () => {
    // Given a target naming a task definition, which is an ECS ARN a rule
    // cannot run anything from.
    const error = await refusedTarget({
      Id: "import",
      Arn: "arn:aws:ecs:us-east-1:888888888888:task-definition/nightly:3",
      RoleArn: roleArn,
      EcsParameters: { TaskDefinitionArn: "nightly" },
    });

    // Then it is refused when the target is added, saying what an ECS target
    // names.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "names no cluster");
  });

  it("refuses a cluster ARN carrying more than the cluster name", async () => {
    // Given a task ARN, whose resource starts `task/<cluster>/` and so reads
    // as a cluster for as long as nothing looks past the name.
    const error = await refusedTarget({
      Id: "import",
      Arn: "arn:aws:ecs:us-east-1:888888888888:task/orders/2f1c",
      RoleArn: roleArn,
      EcsParameters: { TaskDefinitionArn: "nightly" },
    });

    // Then it is refused rather than run against the cluster it names.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "names no cluster");
  });

  it("refuses a TaskDefinitionArn that is not a string", async () => {
    // Given a target built somewhere the types are not checked, which is any
    // template or plain JavaScript.
    const error = await refusedTarget({
      ...ecsTarget({ TaskDefinitionArn: "nightly" }),
      EcsParameters: {
        TaskDefinitionArn: 3,
      } as unknown as Target["EcsParameters"],
    });

    // Then it is refused where it was written, rather than reaching the task
    // definition reader as a type error a long way from its cause.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "TaskDefinitionArn is required");
  });

  it("refuses an ECS target with no role to run the task as", async () => {
    const error = await refusedTarget({
      Id: "import",
      Arn: clusterArn,
      EcsParameters: { TaskDefinitionArn: "nightly" },
    });

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "carries a RoleArn");
  });

  it("refuses a RoleArn that is not a role ARN", async () => {
    const error = await refusedTarget({
      Id: "import",
      Arn: clusterArn,
      RoleArn: "arn:aws:iam::888888888888:user/someone",
      EcsParameters: { TaskDefinitionArn: "nightly" },
    });

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "is not an IAM role ARN");
  });

  it("refuses an ECS target with no EcsParameters", async () => {
    const error = await refusedTarget({
      Id: "import",
      Arn: clusterArn,
      RoleArn: roleArn,
    });

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "EcsParameters is required");
  });

  it("refuses EcsParameters naming no task definition", async () => {
    const error = await refusedTarget(ecsTarget({ TaskDefinitionArn: "" }));

    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "TaskDefinitionArn is required");
  });

  it("refuses a TaskCount outside what ECS runs", async () => {
    // Given counts below, above and between the whole numbers ECS takes.
    const counts = [0, 11, 1.5];

    for (const TaskCount of counts) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await refusedTarget(
        ecsTarget({ TaskDefinitionArn: "nightly", TaskCount }),
      );

      // Then each is refused where it was written, rather than failing every
      // delivery afterwards.
      assertInstanceOf(error, SimEventBridgeValidationException);
      assertStringIncludes(error.message, "TaskCount");
    }
  });

  it("refuses an EcsParameter it does not model rather than dropping it", async () => {
    // Given parameters that would place or tag a real task.
    const error = await refusedTarget(
      ecsTarget({ TaskDefinitionArn: "nightly", Group: "nightly" }),
    );

    // Then it is named rather than ignored, since a target that looks
    // configured and is not is the worse answer.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "EcsParameters Group");
  });

  it("takes the parameters there is no placement or network for", async () => {
    // Given a target written for real AWS, which says where the task runs.
    const simAws = await simulationWithRule();

    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          ecsTarget({
            TaskDefinitionArn: "nightly",
            LaunchType: "FARGATE",
            PlatformVersion: "1.4.0",
            NetworkConfiguration: {
              awsvpcConfiguration: { Subnets: ["subnet-1"] },
            },
            CapacityProviderStrategy: [
              { capacityProvider: "FARGATE_SPOT", weight: 1 },
            ],
          }),
        ],
      }),
    );

    // Then the target was taken, and reports back what it was given: there is
    // no placement and no network here for any of them to apply to, and
    // refusing one would make an otherwise workable target unusable.
    const listed = await simAws
      .eventBridge()
      .listTargetsByRule(new ListTargetsByRuleCommand({ Rule: "orders" }));

    const [target] = listed.Targets ?? [];

    assertNonNullable(target);
    assertIdentical(target.RoleArn, roleArn);
    assertNonNullable(target.EcsParameters);
    assertIdentical(target.EcsParameters.LaunchType, "FARGATE");
    assertIdentical(target.EcsParameters.TaskDefinitionArn, "nightly");
  });

  it("refuses an Input that is not the overrides a task runs with", async () => {
    // Given an Input that is JSON and is not an object.
    const error = await refusedTarget({
      ...ecsTarget({ TaskDefinitionArn: "nightly" }),
      Input: JSON.stringify("nightly"),
    });

    // Then it is refused, since an ECS target has nothing to hand a payload
    // to and reads its Input as the task's overrides instead.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "overrides");
  });

  it("refuses EcsParameters on a target that runs no task", async () => {
    const error = await refusedTarget({
      Id: "orders-queue",
      Arn: queueArn,
      EcsParameters: { TaskDefinitionArn: "nightly" },
    });

    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    assertStringIncludes(error.message, "names an ECS cluster");
  });

  it("still refuses a RoleArn on a target that runs no task", async () => {
    // Given a queue target with a role on it, which real EventBridge takes and
    // never uses.
    const error = await refusedTarget({
      Id: "orders-queue",
      Arn: queueArn,
      RoleArn: roleArn,
    });

    // Then it is refused, because a queue admits the rule through its own
    // resource policy and the role would do nothing.
    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    assertStringIncludes(error.message, "events.amazonaws.com");
  });
});
