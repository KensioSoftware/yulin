import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";
import { SimCfnTemplate } from "../../../sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";

describe("SimCfnTemplate Fn::Select refusals", () => {
  it("refuses an index past the end of the list", () => {
    // Given an index the list has no value for.
    const template = templateWithBucketName({
      "Fn::Select": [2, ["first-bucket", "second-bucket"]],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the refusal names the Resource, the property and the range.
    assertInstanceOf(error, RangeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        "Sim CloudFormation Fn::Select index 2 is out of range for a list of 2 values",
    );
  });

  it("refuses an index that is not a whole number", () => {
    // Given a fractional index.
    const template = templateWithBucketName({
      "Fn::Select": [1.5, ["first-bucket", "second-bucket"]],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the value it was given is quoted back.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        "Sim CloudFormation Fn::Select index must be a whole number, got 1.5",
    );
  });

  it("refuses a negative index", () => {
    // Given an index below the start of the list.
    const template = templateWithBucketName({
      "Fn::Select": [-1, ["first-bucket", "second-bucket"]],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then it is refused rather than counted from the end.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        "Sim CloudFormation Fn::Select index must be a whole number, got -1",
    );
  });

  it("refuses an index string that is not a whole number", () => {
    // Given an index that is a string of something other than digits.
    const template = templateWithBucketName({
      "Fn::Select": ["two", ["first-bucket", "second-bucket"]],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the string it was given is quoted back.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        'Sim CloudFormation Fn::Select index must be a whole number, got "two"',
    );
  });

  it("refuses values that do not resolve to a list", () => {
    // Given a second argument that is a single string.
    const template = templateWithBucketName({
      "Fn::Select": [0, "first-bucket"],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the refusal names the Resource and the property.
    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        "Sim CloudFormation Fn::Select values must resolve to a list, got string",
    );
  });

  it("refuses a list with a null entry", () => {
    // Given a list carrying a null, which CloudFormation rejects.
    const template = templateWithBucketName({
      "Fn::Select": [0, ["first-bucket", null]],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the list is refused, even though the index picks a real value.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        "Sim CloudFormation Fn::Select values must not contain null",
    );
  });

  it("names the list position a failing Fn::Select sat at", () => {
    // Given a failing Fn::Select inside a list property.
    const template = templateWithBucketName("test-bucket", {
      Tags: ["site", { "Fn::Select": [4, ["first", "second"]] }],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the position in the list is part of the path.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.Tags[1]: " +
        "Sim CloudFormation Fn::Select index 4 is out of range for a list of 2 values",
    );
  });

  it("refuses an Fn::Select that is not a two-item list", () => {
    // Given an Fn::Select missing its list.
    const template = templateWithBucketName({ "Fn::Select": [0] });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the expected shape is named.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Select value must be [index, values]",
    );
  });

  it("refuses an out-of-range index found at Resource creation time", async () => {
    // Given a list only a created Resource can supply, selected past its end.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "fn-select-stack",
        template: {
          Resources: {
            SiteBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "site-bucket" },
            },
            LogsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: {
                  "Fn::Select": [
                    9,
                    {
                      "Fn::Split": [
                        ".",
                        { "Fn::GetAtt": ["SiteBucket", "DomainName"] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      }),
    );

    // Then the deployment fails naming the Resource and the property.
    assertStringIncludes(
      error.message,
      "Sim CloudFormation Resource LogsBucket creation failed: " +
        "value at BucketName: Sim CloudFormation Fn::Select index 9 is out " +
        "of range for a list of 4 values",
    );
  });
});

/**
 * A template whose Bucket name property is the value under test.
 */
function templateWithBucketName(
  bucketName: SimCfnTemplateValue,
  otherProperties: Record<string, SimCfnTemplateValue> = {},
): SimCfnTemplate {
  return new SimCfnTemplate({
    stackName: "test-stack",
    template: {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: bucketName, ...otherProperties },
        },
      },
    },
  });
}
