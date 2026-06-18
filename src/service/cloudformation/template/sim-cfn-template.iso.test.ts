import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnTemplate } from "./sim-cfn-template.js";
import { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";

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
      JSON.stringify({
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
      SimCfnTemplate.fromJson(JSON.stringify({}), {
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
        JSON.stringify({
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

  it("throws a clear error when TemplateBody Parameters is not an object", () => {
    const error = assertThrowsError(() => {
      SimCfnTemplate.fromJson(
        JSON.stringify({
          Parameters: ["not", "a", "parameters", "object"],
          Resources: {},
        }),
        {
          stackName: "TestStack",
        },
      );
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack Parameters must be an object",
    );
  });

  it("resolves CloudFormation Parameter default values in Resource templates", () => {
    const template = new SimCfnTemplate({
      stackName: "TestStack",
      template: {
        Parameters: {
          BucketName: {
            Type: "String",
            Default: "default-bucket-name",
          },
        },
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: {
                Ref: "BucketName",
              },
            },
          },
        },
      },
    });

    const resourceTemplates = template.resourceTemplates();

    assertObjectMatches(resourceTemplates[0]?.template, {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "default-bucket-name",
      },
    });
  });

  it("resolves explicit Parameter values in Resource templates", () => {
    const template = new SimCfnTemplate({
      stackName: "TestStack",
      template: {
        Parameters: {
          BucketName: {
            Type: "String",
            Default: "default-bucket-name",
          },
        },
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: {
                Ref: "BucketName",
              },
            },
          },
        },
      },
      parameters: SimCfnParameters.fromValues(
        {
          BucketName: "override-bucket-name",
        },
        {
          stackName: "TestStack",
        },
      ),
    });

    const resourceTemplates = template.resourceTemplates();

    assertObjectMatches(resourceTemplates[0]?.template, {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "override-bucket-name",
      },
    });
  });

  it("resolves CloudFormation Parameter refs recursively in Resource templates", () => {
    const template = new SimCfnTemplate({
      stackName: "TestStack",
      template: {
        Parameters: {
          FirstValue: {
            Type: "String",
            Default: "first",
          },
          SecondValue: {
            Type: "String",
            Default: "second",
          },
        },
        Resources: {
          TestResource: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              Nested: {
                Values: [
                  {
                    Ref: "FirstValue",
                  },
                  {
                    Ref: "SecondValue",
                  },
                ],
              },
            },
          },
        },
      },
    });

    const resourceTemplates = template.resourceTemplates();

    assertObjectMatches(resourceTemplates[0]?.template, {
      Type: "AWS::CloudFormation::WaitConditionHandle",
      Properties: {
        Nested: {
          Values: ["first", "second"],
        },
      },
    });
  });

  it("leaves unknown Refs unchanged", () => {
    const template = new SimCfnTemplate({
      template: {
        Resources: {
          TestResource: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              ResourceRef: {
                Ref: "OtherResource",
              },
            },
          },
        },
      },
    });

    const resourceTemplates = template.resourceTemplates();

    assertObjectMatches(resourceTemplates[0]?.template, {
      Type: "AWS::CloudFormation::WaitConditionHandle",
      Properties: {
        ResourceRef: {
          Ref: "OtherResource",
        },
      },
    });
  });

  it("throws when a referenced CloudFormation Parameter has no value", () => {
    const template = new SimCfnTemplate({
      stackName: "TestStack",
      template: {
        Parameters: {
          BucketName: {
            Type: "String",
          },
        },
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: {
                Ref: "BucketName",
              },
            },
          },
        },
      },
    });

    const error = assertThrowsError(() => {
      template.resourceTemplates();
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack parameter BucketName is missing a value",
    );
  });

  it("throws when a CloudFormation Parameter definition is not an object", () => {
    const error = assertThrowsError(() => {
      new SimCfnTemplate({
        stackName: "TestStack",
        template: {
          Parameters: {
            BucketName: "not-a-parameter-definition",
          },
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
            },
          },
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack parameter BucketName definition must be an object",
    );
  });
});
