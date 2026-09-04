import {
  assertIdentical,
  assertNotEqual,
  assertStringLength,
  assertStringMatches,
  assertStringStartsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCfnGeneratedResourceName } from "./sim-cfn-generated-resource-name.js";

describe("SimCfnGeneratedResourceName", () => {
  it("names a Resource after the stack, the logical ID and a tail", () => {
    // Given a Resource in a stack, whose name is well inside what the service
    // allows.
    const name = new SimCfnGeneratedResourceName({
      stackName: "orders-stack",
      logicalId: "OrdersQueue",
      maximumLength: 80,
    });

    // When the generated name is read, then it carries both parts whole,
    // followed by a tail, as a real CloudFormation generated name does.
    assertStringStartsWith(name.value, "orders-stack-OrdersQueue-");
    assertStringMatches(name.value, /^orders-stack-OrdersQueue-[\da-f]{12}$/);
  });

  it("splits a name too long for the service between the two parts", () => {
    // Given the stack name and logical ID of a role real CloudFormation named
    // ChineseboostAnalyticsStac-RainlyticsSummariesJobFun-UjecjFhpdr1d, where
    // 64 characters leave 25 for the stack name and 25 for the logical ID.
    const name = new SimCfnGeneratedResourceName({
      stackName: "ChineseboostAnalyticsStack",
      logicalId: "RainlyticsSummariesJobFunctionServiceRole1C6CB09C",
      maximumLength: 64,
    });

    // When the generated name is read, then both parts are trimmed to their
    // share of it, so the stack name matches the prefix a real deployment
    // produces and an IAM policy scoped by that prefix allows the same
    // deployments here as in an account.
    assertStringStartsWith(
      name.value,
      "ChineseboostAnalyticsStac-RainlyticsSummariesJobFun-",
    );
    assertStringLength(name.value, 64);
  });

  it("rounds the split up in the stack name's favour", () => {
    // Given a name too long for a bucket, where the 63 characters S3 allows
    // leave an odd number to share between the two parts.
    const name = new SimCfnGeneratedResourceName({
      stackName: "ChineseboostAnalyticsStack",
      logicalId: "RainlyticsLogsBucket8DF4B7A6",
      maximumLength: 63,
    });

    // When the generated name is read, then the stack name has 25 characters
    // and the logical ID 24, which is how real CloudFormation named the bucket
    // chineseboostanalyticsstac-rainlyticslogsbucket8df4-hdst4ohfvdif.
    assertStringStartsWith(
      name.value,
      "ChineseboostAnalyticsStac-RainlyticsLogsBucket8DF4-",
    );
    assertStringLength(name.value, 63);
  });

  it("gives one part the characters the other does not use", () => {
    // Given a short stack name and a logical ID too long for the two of them to
    // fit a load balancer name together.
    const name = new SimCfnGeneratedResourceName({
      stackName: "orders",
      logicalId: "OrdersLoadBalancerC9C60EF3",
      maximumLength: 32,
    });

    // When the generated name is read, then the stack name is kept whole and
    // the logical ID takes the rest, rather than half of it going unused.
    assertStringStartsWith(name.value, "orders-OrdersLoadBa-");
    assertStringLength(name.value, 32);
  });

  it("falls back to the logical ID with no stack name", () => {
    // Given a Resource created outside a stack, which has no stack name to
    // derive a name from.
    const noStackName = new SimCfnGeneratedResourceName({
      stackName: undefined,
      logicalId: "OrdersQueue",
      maximumLength: 80,
    });
    const emptyStackName = new SimCfnGeneratedResourceName({
      stackName: "",
      logicalId: "OrdersQueue",
      maximumLength: 80,
    });

    // When the generated name is read, then it is the logical ID and a tail
    // rather than a name with an empty part in it.
    assertStringMatches(noStackName.value, /^OrdersQueue-[\da-f]{12}$/);
    assertIdentical(emptyStackName.value, noStackName.value);
  });

  it("trims a logical ID standing in for a whole name", () => {
    // Given a Resource outside a stack whose logical ID is on its own longer
    // than the service allows.
    const name = new SimCfnGeneratedResourceName({
      stackName: undefined,
      logicalId: "OrdersQueue".repeat(8),
      maximumLength: 80,
    });

    // When the generated name is read, then it is trimmed to leave room for
    // the tail, as a name with a stack name in it is.
    assertStringStartsWith(name.value, "OrdersQueue".repeat(6));
    assertStringLength(name.value, 80);
  });

  it("generates the same name for the same Resource each deployment", () => {
    // Given the same stack name and logical ID named twice, as two deployments
    // of one template do.
    const properties = {
      stackName: "orders-stack",
      logicalId: "OrdersQueueWithARatherLongLogicalIdIndeed",
      maximumLength: 40,
    };

    // When both generated names are read, then they are the same name, so a
    // test can rely on the name a deployment gives a Resource.
    assertIdentical(
      new SimCfnGeneratedResourceName(properties).value,
      new SimCfnGeneratedResourceName(properties).value,
    );
  });

  it("keeps two trimmed names apart where only the trimmed-off part differs", () => {
    // Given two logical IDs that are the same up to the point a generated name
    // is trimmed at. CDK puts its disambiguating hash at the end of a logical
    // ID, which is the part trimming takes off.
    const stackName = "orders-stack";
    const sharedPrefix = "OrdersQueue".repeat(4);
    const first = new SimCfnGeneratedResourceName({
      stackName,
      logicalId: `${sharedPrefix}E6CA6235`,
      maximumLength: 64,
    });
    const second = new SimCfnGeneratedResourceName({
      stackName,
      logicalId: `${sharedPrefix}1B3D8A07`,
      maximumLength: 64,
    });

    // When both names are read, then they are different names, so the two
    // Resources do not collide on one name.
    assertStringLength(first.value, 64);
    assertStringLength(second.value, 64);
    assertNotEqual(first.value, second.value);
  });

  it("keeps a name inside a limit with no room for both parts", () => {
    // Given a limit shorter than a name and its tail together, which no
    // service this simulates has, but which the trimming should survive.
    const name = new SimCfnGeneratedResourceName({
      stackName: "orders-stack",
      logicalId: "OrdersQueue",
      maximumLength: 10,
    });

    // When the generated name is read, then it is the tail cut to the limit,
    // rather than a name longer than the service would accept.
    assertStringMatches(name.value, /^[\da-f]{10}$/);
  });
});
