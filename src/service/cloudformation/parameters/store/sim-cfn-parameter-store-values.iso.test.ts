import { assertArrayEmpty, assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCfnTemplate } from "../../template/sim-cfn-template.js";

describe("Parameter Store values outside a simulation", () => {
  it("leaves a Parameter holding the name it was given", () => {
    // Given a template resolved with no simulated Parameter Store behind it.
    const template = new SimCfnTemplate({
      stackName: "TestStack",
      template: {
        Parameters: {
          BucketNameParameter: {
            Type: "AWS::SSM::Parameter::Value<String>",
            Default: "/myapp/bucket-name",
          },
        },
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: { Ref: "BucketNameParameter" } },
          },
        },
      },
    });

    // When the Resource templates are read.
    const resourceTemplates = template.resourceTemplates();

    // Then the Ref resolved to the name, there being nothing to read it from.
    assertObjectMatches(resourceTemplates[0]?.template, {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "/myapp/bucket-name" },
    });

    // And nothing is recorded, since no substitution was made.
    assertArrayEmpty(template.parameters.ignoredProperties);
  });
});
