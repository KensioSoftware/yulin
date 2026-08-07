import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";

/* oxlint-disable no-template-curly-in-string */

describe("CloudFormation Fn::Sub parser", () => {
  it("throws when an Fn::Sub value is not a valid shape", async () => {
    const invalidSubTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Sub": ["my-${Name}-bucket"],
            },
          },
        },
      },
    };

    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: invalidSubTemplate,
      }),
    );

    assertInstanceOf(error, Error);
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Sub value must be a string or [string, variables]",
    );
  });

  it("throws when an Fn::Sub array template is not a string", async () => {
    const invalidSubTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Sub": [
                123,
                {
                  Name: "bucket",
                },
              ],
            },
          },
        },
      },
    };

    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: invalidSubTemplate,
      }),
    );

    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Sub template must be a string",
    );
  });

  it("throws when an Fn::Sub variables value is not an object", async () => {
    const invalidSubTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Sub": ["my-${Name}-bucket", "bucket"],
            },
          },
        },
      },
    };

    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: invalidSubTemplate,
      }),
    );

    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Sub variables must be an object",
    );
  });
});
