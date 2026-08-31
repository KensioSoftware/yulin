import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../sim-cfn-template.js";

describe("SimCfnStack Resource Condition", () => {
  it("does not create a Resource whose Condition is false", async () => {
    // Given a Stack with a Bucket only production gets.
    const simAws = new SimAws();

    // When it is deployed as dev.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "resource-condition-stack",
      template: conditionedTemplate(),
      parameters: { EnvName: "dev" },
    });

    // Then that Resource is not in the Stack at all, unlike a skipped one.
    assertUndefined(stack.getResource("Backups"));
    assertArrayEmpty(stack.skippedResources);

    // And the Resource the Condition kept is created and named for dev.
    const site = stack.getResource("Site");
    assertNonNullable(site, "Site Resource");
    assertTrue(site.deployed);
    assertIdentical(
      simAws.s3().getSimBucketByName("site-dev")?.bucketName,
      "site-dev",
    );
  });

  it("creates a Resource whose Condition is true", async () => {
    // Given the same Stack.
    const simAws = new SimAws();

    // When it is deployed as prod.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "resource-condition-stack",
      template: conditionedTemplate(),
      parameters: { EnvName: "prod" },
    });

    // Then both Buckets are created, and the Fn::If took its true branch.
    assertTrue(stack.getResource("Backups") !== undefined);
    assertIdentical(simAws.s3().getSimBucketByName("site")?.bucketName, "site");
  });

  it("refuses a Resource naming a Condition the template does not define", async () => {
    // Given a Resource whose Condition is not in the Conditions section.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "resource-condition-stack",
        template: {
          Conditions: { IsProd: { "Fn::Equals": ["a", "b"] } },
          Resources: {
            Backups: { Type: "AWS::S3::Bucket", Condition: "IsStaging" },
          },
        },
      });
    });

    // Then the error names the Resource and the Condition.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack resource-condition-stack Resource Backups " +
        "names Condition IsStaging, which the template does not define",
    );
  });

  it("refuses a Resource Condition that is not a string", async () => {
    // Given a Resource whose Condition is an expression.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "resource-condition-stack",
        template: {
          Conditions: { IsProd: { "Fn::Equals": ["a", "b"] } },
          Resources: {
            Backups: {
              Type: "AWS::S3::Bucket",
              Condition: { Ref: "IsProd" },
            },
          },
        },
      });
    });

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack resource-condition-stack Resource Backups " +
        "Condition must be a string",
    );
  });

  it("allows an unselected Fn::If branch to name a Resource that is not created", async () => {
    // Given a property whose true branch reads the Bucket only prod creates.
    const simAws = new SimAws();

    // When the Stack is deployed as dev.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "resource-condition-stack",
      template: {
        Parameters: { EnvName: { Type: "String" } },
        Conditions: {
          IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
        },
        Resources: {
          Backups: { Type: "AWS::S3::Bucket", Condition: "IsProd" },
          Site: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: {
                "Fn::If": ["IsProd", { Ref: "Backups" }, "site-dev"],
              },
            },
          },
        },
      },
      parameters: { EnvName: "dev" },
    });

    // Then the branch that was not taken never had to resolve.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertIdentical(
      simAws.s3().getSimBucketByName("site-dev")?.bucketName,
      "site-dev",
    );
  });

  it("refuses a DependsOn to a Resource the Stack does not create", async () => {
    // Given a Resource that waits on a conditioned-out Resource.
    const simAws = new SimAws();

    // When the Stack is deployed as dev.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "resource-condition-stack",
        template: {
          Parameters: { EnvName: { Type: "String" } },
          Conditions: {
            IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
          },
          Resources: {
            Backups: { Type: "AWS::S3::Bucket", Condition: "IsProd" },
            Site: {
              Type: "AWS::S3::Bucket",
              DependsOn: ["Backups"],
              Properties: { BucketName: "site-dev" },
            },
          },
        },
        parameters: { EnvName: "dev" },
      });
    });

    // Then the Condition is named, rather than the deployment waiting on a
    // Resource that is never coming and failing as an unresolvable dependency.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack resource-condition-stack Resource Site names " +
        "Resource Backups, which the Stack does not create because its " +
        "Condition IsProd is false",
    );
  });

  it("refuses a Ref to a Resource the Stack does not create", async () => {
    // Given a Resource property naming a conditioned-out Resource outright,
    // rather than inside the branch of an Fn::If.
    const simAws = new SimAws();

    // When the Stack is deployed as dev.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "resource-condition-stack",
        template: {
          Parameters: { EnvName: { Type: "String" } },
          Conditions: {
            IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
          },
          Resources: {
            Backups: { Type: "AWS::S3::Bucket", Condition: "IsProd" },
            Site: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: { Ref: "Backups" } },
            },
          },
        },
        parameters: { EnvName: "dev" },
      });
    });

    // Then it is refused, rather than deploying a Bucket named after an
    // expression that will never resolve.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack resource-condition-stack Resource Site names " +
        "Resource Backups, which the Stack does not create because its " +
        "Condition IsProd is false",
    );
  });
});

/**
 * A Stack whose Backups Bucket and Site Bucket name both follow EnvName.
 */
function conditionedTemplate(): CfnTemplateBodyRecord {
  return {
    Parameters: { EnvName: { Type: "String" } },
    Conditions: { IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] } },
    Resources: {
      Backups: {
        Type: "AWS::S3::Bucket",
        Condition: "IsProd",
        Properties: { BucketName: "site-backups" },
      },
      Site: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::If": [
              "IsProd",
              "site",
              // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
              { "Fn::Sub": ["site-${Env}", { Env: { Ref: "EnvName" } }] },
            ],
          },
        },
      },
    },
  };
}
