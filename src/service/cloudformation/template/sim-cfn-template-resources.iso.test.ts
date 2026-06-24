import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnTemplate } from "./sim-cfn-template.js";

describe("SimCfnTemplate", () => {
  it("accepts an empty Resources object", () => {
    const template = new SimCfnTemplate({
      template: {
        Resources: {},
      },
    });

    assertArrayLength(template.resourceTemplates(), 0);
  });

  it("returns CloudFormation Resource template records", () => {
    const template = new SimCfnTemplate({
      template: {
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "test-bucket",
            },
          },
          WaitHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
          },
        },
      },
    });

    const resourceTemplates = template.resourceTemplates();

    assertArrayLength(resourceTemplates, 2);
    assertIdentical(resourceTemplates[0].logicalId, "TestBucket");
    assertObjectMatches(resourceTemplates[0].template, {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "test-bucket",
      },
    });
    assertIdentical(resourceTemplates[1].logicalId, "WaitHandle");
    assertObjectMatches(resourceTemplates[1].template, {
      Type: "AWS::CloudFormation::WaitConditionHandle",
    });
  });

  it("ignores Resource entries that are not objects", () => {
    const template = new SimCfnTemplate({
      template: {
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
          },
          InvalidResource: "not-a-resource-object",
        },
      },
    });

    const resourceTemplates = template.resourceTemplates();

    assertArrayLength(resourceTemplates, 1);
    assertIdentical(resourceTemplates[0].logicalId, "TestBucket");
  });
});
