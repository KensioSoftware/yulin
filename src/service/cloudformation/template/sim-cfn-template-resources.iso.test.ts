import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnTemplate } from "./sim-cfn-template.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

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

  it("parses from JSON", () => {
    const template = SimCfnTemplate.fromJson(
      jsonStringify({
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
          },
        },
      }),
    );

    const resourceTemplates = template.resourceTemplates();

    assertArrayLength(resourceTemplates, 1);
    assertIdentical(resourceTemplates[0].logicalId, "TestBucket");
    assertObjectMatches(resourceTemplates[0].template, {
      Type: "AWS::S3::Bucket",
    });
  });

  it("throws a clear error when TemplateBody is not valid JSON", () => {
    const error = assertThrowsError(() => {
      // @ts-expect-error -- testing bad input
      SimCfnTemplate.fromJson("{not-json", {
        stackName: "TestStack",
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack TemplateBody must be valid JSON",
    );
  });

  it("throws a clear error when TemplateBody does not parse to an object", () => {
    const error = assertThrowsError(() => {
      // @ts-expect-error -- testing bad input
      SimCfnTemplate.fromJson("null", {
        stackName: "TestStack",
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack TemplateBody must parse to an object",
    );
  });

  it("throws a clear error when TemplateBody is missing Resources", () => {
    const error = assertThrowsError(() => {
      // @ts-expect-error -- testing bad input
      SimCfnTemplate.fromJson(jsonStringify({}), {
        stackName: "TestStack",
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack TemplateBody must include a Resources object",
    );
  });

  it("throws a clear error when TemplateBody Resources is not an object", () => {
    const error = assertThrowsError(() => {
      SimCfnTemplate.fromJson(
        // @ts-expect-error -- testing bad input
        jsonStringify({
          Resources: ["not", "a", "resources", "object"],
        }),
        {
          stackName: "TestStack",
        },
      );
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack TemplateBody Resources must be an object",
    );
  });
});
