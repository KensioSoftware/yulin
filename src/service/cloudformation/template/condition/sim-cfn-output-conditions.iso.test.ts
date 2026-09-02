import { DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  assertIdentical,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../sim-cfn-template.js";

describe("SimCfnStack Output Condition", () => {
  it("leaves out an Output whose Condition is false", async () => {
    // Given a Stack whose backup Output only production gets.
    const simAws = new SimAws();

    // When it is deployed as dev.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "output-condition-stack",
      template: conditionedTemplate(),
      parameters: { EnvName: "dev" },
    });

    // Then the Stack has no such Output at all.
    assertUndefined(stack.outputs.get("BackupsBucketName"));

    // And the Output the Condition kept is there.
    assertIdentical(stack.outputs.get("SiteBucketName")?.value, "site-bucket");
  });

  it("leaves a false Output out of DescribeStacks", async () => {
    // Given the same Stack deployed as dev.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.deployTemplate({
      stackName: "output-condition-stack",
      template: conditionedTemplate(),
      parameters: { EnvName: "dev" },
    });

    // When the Stack is described.
    const result = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "output-condition-stack" }),
    );
    const outputKeys = result.Stacks?.[0]?.Outputs?.map(
      (output) => output.OutputKey,
    );

    // Then only the Output whose Condition is true is listed.
    assertIdentical(outputKeys?.join(","), "SiteBucketName");
  });

  it("resolves and exports an Output whose Condition is true", async () => {
    // Given the same Stack deployed as prod.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    const stack = await cloudFormation.deployTemplate({
      stackName: "output-condition-stack",
      template: conditionedTemplate(),
      parameters: { EnvName: "prod" },
    });

    // Then the Output resolves and carries its export name.
    assertIdentical(
      stack.outputs.get("BackupsBucketName")?.value,
      "site-backups",
    );

    // And another Stack can import the export it published.
    await cloudFormation.deployTemplate({
      stackName: "output-condition-importing-stack",
      template: importingTemplate(),
    });

    assertIdentical(
      simAws.s3().getSimBucketByName("site-backups-copy")?.bucketName,
      "site-backups-copy",
    );
  });

  it("publishes no export for an Output whose Condition is false", async () => {
    // Given the Stack deployed as dev, so its backup Output is left out.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.deployTemplate({
      stackName: "output-condition-stack",
      template: conditionedTemplate(),
      parameters: { EnvName: "dev" },
    });

    // When another Stack imports the export name that Output carried.
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.deployTemplate({
        stackName: "output-condition-importing-stack",
        template: importingTemplate(),
      });
    });

    // Then the import finds nothing, because nothing was published.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource BackupsCopy value at Properties.BucketName: " +
        "No export named BackupsBucketName found",
    );
  });

  it("refuses an Output naming a Condition the template does not define", async () => {
    // Given an Output whose Condition is not in the Conditions section.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "output-condition-stack",
        template: {
          Conditions: { IsProd: { "Fn::Equals": ["a", "b"] } },
          Resources: {},
          Outputs: {
            BackupsBucketName: {
              Value: "site-backups",
              Condition: "IsStaging",
            },
          },
        },
      });
    });

    // Then the error names the Output and the Condition.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack output-condition-stack Output " +
        "BackupsBucketName names Condition IsStaging, which the template does " +
        "not define",
    );
  });

  it("refuses an Output Condition that is not a string", async () => {
    // Given an Output whose Condition is written as an expression.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "output-condition-stack",
        template: {
          Conditions: { IsProd: { "Fn::Equals": ["a", "b"] } },
          Resources: {},
          Outputs: {
            BackupsBucketName: {
              Value: "site-backups",
              Condition: { Condition: "IsProd" },
            },
          },
        },
      });
    });

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack output-condition-stack Output " +
        "BackupsBucketName Condition must be a string",
    );
  });
});

/**
 * A Stack exporting a backup Bucket name only production has an Output for.
 */
function conditionedTemplate(): CfnTemplateBodyRecord {
  return {
    Parameters: { EnvName: { Type: "String" } },
    Conditions: { IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] } },
    Resources: {
      Site: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-bucket" },
      },
      Backups: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-backups" },
      },
    },
    Outputs: {
      SiteBucketName: { Value: { Ref: "Site" } },
      BackupsBucketName: {
        Condition: "IsProd",
        Value: { Ref: "Backups" },
        Export: { Name: "BackupsBucketName" },
      },
    },
  };
}

/**
 * A Stack naming its Bucket after the export the other Stack may have made.
 */
function importingTemplate(): CfnTemplateBodyRecord {
  return {
    Resources: {
      BackupsCopy: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::Join": [
              "-",
              [{ "Fn::ImportValue": "BackupsBucketName" }, "copy"],
            ],
          },
        },
      },
    },
  };
}
