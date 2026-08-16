import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";

/**
 * A template whose only Resource is one no service claims, referenced both
 * ways, so a test can read what a skipped Resource answers with.
 */
const skippedInstanceTemplate: CfnTemplateBodyRecord = {
  Resources: {
    WebServer: {
      Type: "AWS::EC2::Instance",
    },
  },
  Outputs: {
    InstanceRef: { Value: { Ref: "WebServer" } },
    InstanceArn: { Value: { "Fn::GetAtt": ["WebServer", "Arn"] } },
  },
};

describe("skipped CloudFormation Resource values", () => {
  it("answers a Ref with the logical ID", async () => {
    // Given a template holding a Ref to a Resource type that is not simulated.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "stand-in-stack",
      template: skippedInstanceTemplate,
    });
    await stack.waitForDeployComplete();

    // Then the Ref resolved to the logical ID rather than failing the
    // Resources that hold it.
    assertIdentical(stack.outputs.get("InstanceRef")?.value, "WebServer");
  });

  it("answers an Fn::GetAtt with the logical ID and attribute name", async () => {
    // Given a template holding an Fn::GetAtt to a Resource type that is not
    // simulated.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "stand-in-stack",
      template: skippedInstanceTemplate,
    });
    await stack.waitForDeployComplete();

    // Then the attribute resolved to a stand-in that is deliberately not
    // ARN-shaped, so it fails closed wherever it is read as one.
    assertIdentical(stack.outputs.get("InstanceArn")?.value, "WebServer.Arn");
  });

  it("records the skip the stand-ins came from", async () => {
    // Given the same template, whose rule is skipped rather than created.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "stand-in-stack",
      template: skippedInstanceTemplate,
    });
    await stack.waitForDeployComplete();

    // Then the Stack says which Resource was skipped and why, which is how a
    // reader finds out a value they got was a stand-in.
    assertArrayLength(stack.skippedResources, 1);
    assertStringIncludes(
      stack.getResource("WebServer")?.skippedReason ?? "",
      "Unsupported sim CloudFormation Resource service EC2",
    );
  });
});
