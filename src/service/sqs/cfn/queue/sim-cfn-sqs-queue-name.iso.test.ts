import {
  assertFalse,
  assertIdentical,
  assertStringLength,
  assertStringStartsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCfnSqsQueueName } from "./sim-cfn-sqs-queue-name.js";

describe("SimCfnSqsQueueName", () => {
  it("names a queue after the stack and the logical ID", () => {
    // Given a Resource in a stack.
    const name = new SimCfnSqsQueueName({
      stackName: "orders-stack",
      logicalId: "OrdersQueue",
    });

    // When the generated name is read, then it carries both, as a real
    // CloudFormation generated name does.
    assertIdentical(name.value, "orders-stack-OrdersQueue");
  });

  it("falls back to the logical ID with no stack name", () => {
    // Given a Resource created outside a stack, which has no stack name to
    // derive a name from.
    const noStack = new SimCfnSqsQueueName({
      stackName: undefined,
      logicalId: "OrdersQueue",
    });
    const emptyStackName = new SimCfnSqsQueueName({
      stackName: "",
      logicalId: "OrdersQueue",
    });

    // When the generated name is read, then it is the logical ID on its own
    // rather than a name with an empty part in it.
    assertIdentical(noStack.value, "OrdersQueue");
    assertIdentical(emptyStackName.value, "OrdersQueue");
  });

  it("trims a generated name to the 80 characters SQS allows", () => {
    // Given a stack name and logical ID that are too long together for a queue
    // name, which real SQS refuses at 81 characters.
    const name = new SimCfnSqsQueueName({
      stackName: "a".repeat(60),
      logicalId: "OrdersQueueWithARatherLongLogicalId",
    });

    // When the generated name is read, then it is trimmed to fit, keeping the
    // start, so the stack name is still in it.
    assertStringLength(name.value, 80);
    assertStringStartsWith(name.value, `${"a".repeat(60)}-OrdersQu`);

    // And the same template generates the same name again, rather than a new
    // one each deployment.
    assertIdentical(
      name.value,
      new SimCfnSqsQueueName({
        stackName: "a".repeat(60),
        logicalId: "OrdersQueueWithARatherLongLogicalId",
      }).value,
    );
  });

  it("keeps two trimmed names apart where only the trimmed-off part differs", () => {
    // Given two logical IDs that are the same up to the point a generated name
    // is trimmed at. CDK puts its disambiguating hash at the end of a logical
    // ID, which is the part trimming takes off.
    const stackName = "a".repeat(40);
    const sharedPrefix = "OrdersQueue".repeat(4);
    const first = new SimCfnSqsQueueName({
      stackName,
      logicalId: `${sharedPrefix}E6CA6235`,
    });
    const second = new SimCfnSqsQueueName({
      stackName,
      logicalId: `${sharedPrefix}1B3D8A07`,
    });

    // When both names are read, then they are different names, so the two
    // queues do not collide on one name.
    assertStringLength(first.value, 80);
    assertStringLength(second.value, 80);
    assertFalse(first.value === second.value);
  });
});
