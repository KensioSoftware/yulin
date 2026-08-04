import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";
import { SimCfnTemplate } from "../../../sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";

describe("SimCfnTemplate Fn::If", () => {
  it("resolves the branch the Condition selects in a Resource property", () => {
    // Given a Resource property choosing a Bucket name by Condition.
    const template = templateWithBucketName({
      // eslint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
      "Fn::If": ["IsProd", "site", { "Fn::Sub": "site-${EnvName}" }],
    });

    // When the Resource templates are read with EnvName left at dev.
    const resourceTemplate = template.resourceTemplates()[0];
    assertNonNullable(resourceTemplate, "Site Resource template");

    // Then the false branch is the one that resolved.
    assertObjectMatches(resourceTemplate.template, {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "site-dev" },
    });
  });

  it("leaves the branch the Condition does not select unresolved", () => {
    // Given a true branch that would fail if it were resolved.
    const template = templateWithBucketName({
      "Fn::If": [
        "IsProd",
        { "Fn::FindInMap": ["RegionMap", "us-east-1", "MissingAMI"] },
        "site-dev",
      ],
    });

    // When the Resource templates are read with the Condition false.
    const resourceTemplate = template.resourceTemplates()[0];
    assertNonNullable(resourceTemplate, "Site Resource template");

    // Then the deployment is unaffected by what the unused branch names.
    assertObjectMatches(resourceTemplate.template, {
      Properties: { BucketName: "site-dev" },
    });
  });

  it("resolves a nested Fn::If", () => {
    // Given a branch that is itself an Fn::If.
    const template = templateWithBucketName({
      "Fn::If": [
        "IsProd",
        "site",
        { "Fn::If": ["IsProd", "unreachable", { Ref: "EnvName" }] },
      ],
    });

    // When the Resource templates are read.
    const resourceTemplate = template.resourceTemplates()[0];
    assertNonNullable(resourceTemplate, "Site Resource template");

    // Then the inner Fn::If resolved too.
    assertObjectMatches(resourceTemplate.template, {
      Properties: { BucketName: "dev" },
    });
  });

  it("resolves Fn::If in an Output", async () => {
    // Given a Stack whose Output picks between a literal and a Resource Ref.
    const simAws = new SimAws();

    // When the Stack is deployed with the Condition false.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "fn-if-stack",
      template: {
        Parameters: { EnvName: { Type: "String", Default: "dev" } },
        Conditions: {
          IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
        },
        Resources: {
          Site: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "fn-if-site-dev" },
          },
        },
        Outputs: {
          SiteName: {
            Value: { "Fn::If": ["IsProd", "production-site", { Ref: "Site" }] },
          },
        },
      },
    });

    // Then the false branch resolved against the created Resource.
    assertIdentical(stack.outputs.get("SiteName")?.value, "fn-if-site-dev");
  });

  it("refuses an Fn::If naming a Condition the template does not define", () => {
    // Given an Fn::If naming an unknown Condition.
    const template = templateWithBucketName({
      "Fn::If": ["IsStaging", "site", "site-dev"],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the Condition is named rather than read as false.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource Site value at Properties.BucketName: " +
        "Sim CloudFormation Fn::If names Condition IsStaging, which the " +
        "template does not define",
    );
  });

  it("refuses an Fn::If that is not a three-item list", () => {
    // Given an Fn::If with no false branch.
    const template = templateWithBucketName({
      "Fn::If": ["IsProd", "site"],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then a clear validation error is thrown.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::If value must be [conditionName, valueIfTrue, valueIfFalse]",
    );
  });

  it("refuses an Fn::If whose Condition name is not a string", () => {
    // Given an Fn::If naming its Condition with an expression.
    const template = templateWithBucketName({
      "Fn::If": [{ Ref: "EnvName" }, "site", "site-dev"],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then a clear validation error is thrown.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::If condition name must be a string",
    );
  });
});

/**
 * A one-Bucket template whose name is the given expression, with an IsProd
 * Condition that is false for the default EnvName.
 */
function templateWithBucketName(
  bucketName: SimCfnTemplateValue,
): SimCfnTemplate {
  return new SimCfnTemplate({
    stackName: "fn-if-stack",
    template: {
      Parameters: { EnvName: { Type: "String", Default: "dev" } },
      Conditions: { IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] } },
      Mappings: { RegionMap: { "us-east-1": { AMI: "ami-00000000" } } },
      Resources: {
        Site: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: bucketName },
        },
      },
    },
  });
}
