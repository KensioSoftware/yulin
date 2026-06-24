import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnTemplate } from "../../../sim-cfn-template.js";

describe("SimCfnTemplate Fn::FindInMap Resources", () => {
  it("resolves Fn::FindInMap Resource template values from template Mappings", () => {
    const template = new SimCfnTemplate({
      template: {
        Mappings: {
          RegionMap: {
            "us-east-1": {
              AMI: "ami-1234567890abcdef0",
            },
          },
        },
        Resources: {
          TestInstance: {
            Type: "AWS::EC2::Instance",
            Properties: {
              ImageId: {
                "Fn::FindInMap": ["RegionMap", "us-east-1", "AMI"],
              },
            },
          },
        },
      },
    });

    const resourceTemplates = template.resourceTemplates();
    const resourceTemplate = resourceTemplates[0];

    if (resourceTemplate === undefined) {
      throw new Error("Expected TestInstance Resource template");
    }

    assertObjectMatches(resourceTemplate.template, {
      Type: "AWS::EC2::Instance",
      Properties: {
        ImageId: "ami-1234567890abcdef0",
      },
    });
  });

  it("resolves Fn::FindInMap keys from Parameters", () => {
    const template = new SimCfnTemplate({
      template: {
        Parameters: {
          Environment: {
            Type: "String",
            Default: "prod",
          },
        },
        Mappings: {
          EnvironmentMap: {
            prod: {
              BucketName: "production-bucket",
            },
          },
        },
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: {
                "Fn::FindInMap": [
                  "EnvironmentMap",
                  { Ref: "Environment" },
                  "BucketName",
                ],
              },
            },
          },
        },
      },
    });

    const resourceTemplates = template.resourceTemplates();
    const resourceTemplate = resourceTemplates[0];

    if (resourceTemplate === undefined) {
      throw new Error("Expected TestBucket Resource template");
    }

    assertObjectMatches(resourceTemplate.template, {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "production-bucket",
      },
    });
  });

  it("throws when Fn::FindInMap is not a three-item array", () => {
    // Given a template with an invalid Fn::FindInMap value.
    const template = new SimCfnTemplate({
      template: {
        Mappings: {
          RegionMap: {
            "us-east-1": {
              AMI: "ami-1234567890abcdef0",
            },
          },
        },
        Resources: {
          TestInstance: {
            Type: "AWS::EC2::Instance",
            Properties: {
              ImageId: {
                "Fn::FindInMap": ["RegionMap", "us-east-1"],
              },
            },
          },
        },
      },
    });

    // When the template Resource values are parsed.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then a clear validation error is thrown.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::FindInMap value must be [mapName, topLevelKey, secondLevelKey]",
    );
  });

  it("keeps Fn::FindInMap unresolved when a key resolves to another intrinsic", () => {
    // Given a template with a Fn::FindInMap key that cannot resolve to a string yet.
    const template = new SimCfnTemplate({
      template: {
        Mappings: {
          RegionMap: {
            "us-east-1": {
              AMI: "ami-1234567890abcdef0",
            },
          },
        },
        Resources: {
          TestInstance: {
            Type: "AWS::EC2::Instance",
            Properties: {
              ImageId: {
                "Fn::FindInMap": [
                  "RegionMap",
                  { Ref: "MissingResource" },
                  "AMI",
                ],
              },
            },
          },
        },
      },
    });

    // When the Resource template values are parsed.
    const resourceTemplates = template.resourceTemplates();
    const resourceTemplate = resourceTemplates[0];

    assertNonNullable(resourceTemplate, "TestInstance Resource template");

    // Then the unresolved key keeps the Fn::FindInMap expression intact.
    assertObjectMatches(resourceTemplate.template, {
      Type: "AWS::EC2::Instance",
      Properties: {
        ImageId: {
          "Fn::FindInMap": ["RegionMap", { Ref: "MissingResource" }, "AMI"],
        },
      },
    });
  });

  it("throws when Fn::FindInMap cannot find a second-level key", () => {
    // Given a template with a missing second-level Mapping key.
    const template = new SimCfnTemplate({
      template: {
        Mappings: {
          RegionMap: {
            "us-east-1": {
              AMI: "ami-1234567890abcdef0",
            },
          },
        },
        Resources: {
          TestInstance: {
            Type: "AWS::EC2::Instance",
            Properties: {
              ImageId: {
                "Fn::FindInMap": ["RegionMap", "us-east-1", "MissingAMI"],
              },
            },
          },
        },
      },
    });

    // When the Resource template values are parsed.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then a clear missing Mapping value error is thrown.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::FindInMap could not find map RegionMap.us-east-1.MissingAMI",
    );
  });
});
