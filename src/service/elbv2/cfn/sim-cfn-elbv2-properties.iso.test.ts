import { DescribeTargetGroupsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertFalse,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimElbV2 } from "../sim-elbv2.js";

/**
 * A template declaring one target group, which is the Resource carrying the
 * widest set of property shapes: strings, numbers, booleans, a structure and a
 * list of structures.
 */
function targetGroupTemplate(
  properties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      WebTargets: {
        Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
        Properties: {
          Name: "web-tg",
          TargetType: "ip",
          Protocol: "HTTP",
          Port: 80,
          ...properties,
        },
      },
    },
  };
}

describe("Reading ELBv2 CloudFormation properties", () => {
  it("reads a boolean the template declared as false", async () => {
    // Given a target group turning health checking off.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: targetGroupTemplate({ HealthCheckEnabled: false }),
    });

    await stack.waitForDeployComplete();

    // Then the group holds it off, rather than falling back to the default.
    const described = await simAws
      .elbV2()
      .describeTargetGroups(
        new DescribeTargetGroupsCommand({ Names: ["web-tg"] }),
      );

    assertArrayLength(described.TargetGroups, 1);
    assertFalse(described.TargetGroups[0].HealthCheckEnabled);

    await simAws.backgroundTasksComplete();
  });

  it("refuses a boolean property that is neither true nor false", async () => {
    // Given a target group whose HealthCheckEnabled is a word.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: targetGroupTemplate({ HealthCheckEnabled: "sometimes" }),
      });
    });

    assertStringIncludes(error.message, "WebTargets");
    assertStringIncludes(error.message, "HealthCheckEnabled is a boolean");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a number property carried as a blank string", async () => {
    // Given a target group whose Port is a string with nothing in it, which a
    // template Parameter left unset can leave behind.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: targetGroupTemplate({ Port: "  " }),
      });
    });

    assertStringIncludes(error.message, "Port is a number");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a structure property that is not an object", async () => {
    // Given a target group whose Matcher is a status code rather than the
    // structure holding one.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "shop-stack",
        template: targetGroupTemplate({ Matcher: "200" }),
      });
    });

    assertStringIncludes(error.message, "Matcher is an object");

    await simAws.backgroundTasksComplete();
  });

  it("skips an ELBv2 Resource type this simulation does not create", async () => {
    // Given a template declaring a trust store, which nothing here simulates.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "shop-stack",
      template: {
        Resources: {
          ClientCerts: {
            Type: "AWS::ElasticLoadBalancingV2::TrustStore",
            Properties: { Name: "client-certs" },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the stack deploys with the Resource recorded as unsupported rather
    // than failing, so the rest of a stack holding one is still usable.
    const skipped = stack.skippedResources;
    assertArrayLength(skipped, 1);
    assertNonNullable(skipped[0].skippedReason);
    assertStringIncludes(skipped[0].skippedReason, "TrustStore");

    await simAws.backgroundTasksComplete();
  });

  it("refuses to delete a Resource type it does not create", async () => {
    // Given the factory and a Resource of a type it has no deleter for, which
    // is the same refusal the create side makes.
    const factory = new SimElbV2().cfnResourceFactory();
    const resource = new SimCfnResource({
      logicalId: "ClientCerts",
      template: { Type: "AWS::ElasticLoadBalancingV2::TrustStore" },
    });

    // When it is asked to delete it, then it refuses naming the type, so the
    // teardown records it and carries on.
    const error = await assertThrowsErrorAsync(async () => {
      await factory.delete("TrustStore", resource, {
        simAws: new SimAws(),
        resources: new Map(),
      });
    });

    assertStringIncludes(error.message, "TrustStore deletion");
  });
});
