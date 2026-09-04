import {
  assertIdentical,
  assertNotEqual,
  assertStringLength,
  assertStringMatches,
  assertStringStartsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCfnSnsTopicName } from "./sim-cfn-sns-topic-name.js";

describe("SimCfnSnsTopicName", () => {
  it("names a topic after the stack and the logical ID", () => {
    // Given a Resource in a stack.
    const name = new SimCfnSnsTopicName({
      stackName: "orders-stack",
      logicalId: "OrdersTopic",
    });

    // When the generated name is read, then it carries both and a tail, as a
    // real CloudFormation generated name does.
    assertStringMatches(name.value, /^orders-stack-OrdersTopic-[\da-f]{12}$/);
  });

  it("falls back to the logical ID with no stack name", () => {
    // Given a Resource created outside a stack, which has no stack name to
    // derive a name from.
    const noStack = new SimCfnSnsTopicName({
      stackName: undefined,
      logicalId: "OrdersTopic",
    });
    const emptyStackName = new SimCfnSnsTopicName({
      stackName: "",
      logicalId: "OrdersTopic",
    });

    // When the generated name is read, then it is the logical ID and a tail
    // rather than a name with an empty part in it.
    assertStringMatches(noStack.value, /^OrdersTopic-[\da-f]{12}$/);
    assertIdentical(emptyStackName.value, noStack.value);
  });

  it("trims a generated name to the 256 characters SNS allows", () => {
    // Given a stack name and logical ID that are too long together for a topic
    // name, which real SNS refuses at 257 characters.
    const name = new SimCfnSnsTopicName({
      stackName: "a".repeat(200),
      logicalId: "OrdersTopicWithARatherLongLogicalIdIndeed".repeat(2),
    });

    // When the generated name is read, then it is trimmed to fit, and the
    // logical ID keeps the characters the stack name does not need.
    assertStringLength(name.value, 256);
    assertStringStartsWith(
      name.value,
      `${"a".repeat(160)}-${"OrdersTopicWithARatherLongLogicalIdIndeed".repeat(2)}-`,
    );

    // And the same template generates the same name again, rather than a new
    // one each deployment.
    assertIdentical(
      name.value,
      new SimCfnSnsTopicName({
        stackName: "a".repeat(200),
        logicalId: "OrdersTopicWithARatherLongLogicalIdIndeed".repeat(2),
      }).value,
    );
  });

  it("keeps two trimmed names apart where only the trimmed-off part differs", () => {
    // Given two logical IDs that are the same up to the point a generated name
    // is trimmed at. CDK puts its disambiguating hash at the end of a logical
    // ID, which is the part trimming takes off.
    const stackName = "a".repeat(200);
    const sharedPrefix = "OrdersTopic".repeat(6);
    const first = new SimCfnSnsTopicName({
      stackName,
      logicalId: `${sharedPrefix}E6CA6235`,
    });
    const second = new SimCfnSnsTopicName({
      stackName,
      logicalId: `${sharedPrefix}1B3D8A07`,
    });

    // When both names are read, then they are different names, so the two
    // topics do not collide on one name.
    assertStringLength(first.value, 256);
    assertStringLength(second.value, 256);
    assertNotEqual(first.value, second.value);
  });
});
