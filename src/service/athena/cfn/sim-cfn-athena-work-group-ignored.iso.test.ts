import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

describe("AWS::Athena::WorkGroup unread properties", () => {
  const simAws = new SimAws();

  async function deployed(
    stackName: string,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimCfnDeployedStack> {
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName,
      template: {
        Resources: {
          Queries: { Type: "AWS::Athena::WorkGroup", Properties: properties },
        },
      },
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    return stack;
  }

  function ignoredReason(stack: SimCfnDeployedStack, path: string): string {
    return (
      stack.ignoredProperties.find((ignored) => ignored.path === path)
        ?.reason ?? ""
    );
  }

  it("deploys a workgroup carrying settings the simulation cannot act on", async () => {
    // Given a template setting an execution role and tags, neither of which
    // this simulation has anything to do with.
    // When it is deployed.
    const stack = await deployed("execution-role-stack", {
      Name: "with-a-runner",
      Tags: [{ Key: "app", Value: "rainlytics" }],
      WorkGroupConfiguration: {
        BytesScannedCutoffPerQuery: 1_000_000,
        ExecutionRole: "arn:aws:iam::888888888888:role/AthenaRunner",
      },
    });

    // Then the workgroup deploys with the cutoff it does model, and each
    // setting it does not is recorded rather than failing the stack.
    assertArrayLength(stack.skippedResources, 0);
    assertIdentical(
      simAws.athena().findWorkGroup("with-a-runner")
        ?.bytesScannedCutoffPerQuery,
      1_000_000,
    );
    assertStringIncludes(ignoredReason(stack, "Tags"), "workgroup tags");
    assertStringIncludes(
      ignoredReason(stack, "WorkGroupConfiguration.ExecutionRole"),
      "no query runs",
    );
  });

  it("records a workgroup property Athena has no such thing as", async () => {
    // Given a template carrying a property nothing in Athena defines, which a
    // hand-written template gets wrong.
    // When it is deployed.
    const stack = await deployed("nonsense-stack", {
      Name: "with-nonsense",
      Nonsense: "value",
    });

    // Then the workgroup is still created, and the property is recorded as one
    // this simulation knows nothing about.
    assertArrayLength(stack.skippedResources, 0);
    assertTrue(simAws.athena().findWorkGroup("with-nonsense") !== undefined);
    assertStringIncludes(
      ignoredReason(stack, "Nonsense"),
      "not a property simulated Athena knows",
    );
  });
});
