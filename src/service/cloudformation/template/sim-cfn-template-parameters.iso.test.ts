import {
  assertIdentical,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnTemplate } from "./sim-cfn-template.js";
import { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

describe("SimCfnTemplate params", () => {
  it("throws a clear error when TemplateBody Parameters is not an object", () => {
    const error = assertThrowsError(() => {
      SimCfnTemplate.fromJson(
        // @ts-expect-error -- testing bad input
        jsonStringify({
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

  it("does not replace Ref-containing objects with sibling keys", () => {
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
          TestResource: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              NotAnIntrinsicRef: {
                Ref: "BucketName",
                Extra: 1,
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
        NotAnIntrinsicRef: {
          Ref: "BucketName",
          Extra: 1,
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
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        "Sim CloudFormation Stack TestStack parameter BucketName is missing a value",
    );
  });

  it("throws when a CloudFormation Parameter definition is not an object", () => {
    const error = assertThrowsError(() => {
      new SimCfnTemplate({
        stackName: "TestStack",
        template: {
          Parameters: {
            // @ts-expect-error -- testing bad input
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
