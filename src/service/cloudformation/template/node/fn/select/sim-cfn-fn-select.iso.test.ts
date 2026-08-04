import {
  assertArrayEquals,
  assertNonNullable,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";
import { SimCfnTemplate } from "../../../sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";

describe("SimCfnTemplate Fn::Select", () => {
  it("picks a value from a literal list", () => {
    // Given a Resource property selecting from a list written in the template.
    const template = templateWithBucketName({
      "Fn::Select": [1, ["first-bucket", "second-bucket"]],
    });

    // When the Resource templates are read.
    const properties = resolvedProperties(template);

    // Then the value at the zero-based index is the property value.
    assertObjectMatches(properties, { BucketName: "second-bucket" });
  });

  it("picks a host out of a URL with Fn::Split", () => {
    // Given the URL-splitting shape CDK writes for a Function URL origin.
    const template = templateWithBucketName({
      "Fn::Select": [
        2,
        {
          "Fn::Split": ["/", "https://abc123.lambda-url.eu-west-2.on.aws/"],
        },
      ],
    });

    // When the Resource templates are read.
    const properties = resolvedProperties(template);

    // Then the host is what the property resolves to.
    assertObjectMatches(properties, {
      BucketName: "abc123.lambda-url.eu-west-2.on.aws",
    });
  });

  it("accepts an index written as a string", () => {
    // Given an index in the string form a JSON template often carries.
    const template = templateWithBucketName({
      "Fn::Select": ["0", ["first-bucket", "second-bucket"]],
    });

    // When the Resource templates are read.
    const properties = resolvedProperties(template);

    // Then it selects the same value the number form would.
    assertObjectMatches(properties, { BucketName: "first-bucket" });
  });

  it("accepts an index read from a Parameter", () => {
    // Given an index supplied as a Parameter, which is always a string.
    const template = templateWithBucketName(
      { "Fn::Select": [{ Ref: "Index" }, ["first-bucket", "second-bucket"]] },
      { Index: { Type: "String", Default: "1" } },
    );

    // When the Resource templates are read.
    const properties = resolvedProperties(template);

    // Then the Parameter value is read as the index.
    assertObjectMatches(properties, { BucketName: "second-bucket" });
  });

  it("picks a value out of a Mapping list", () => {
    // Given a Mappings entry holding a list.
    const template = new SimCfnTemplate({
      stackName: "test-stack",
      template: {
        Mappings: {
          EnvironmentMap: { staging: { Buckets: ["staging-a", "staging-b"] } },
        },
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: {
                "Fn::Select": [
                  1,
                  { "Fn::FindInMap": ["EnvironmentMap", "staging", "Buckets"] },
                ],
              },
            },
          },
        },
      },
    });

    // When the Resource templates are read.
    const properties = resolvedProperties(template);

    // Then the list the Mapping gave is selected from.
    assertObjectMatches(properties, { BucketName: "staging-b" });
  });

  it("leaves an unresolved list for the Resource creation pass", () => {
    // Given a list that cannot be built until a Resource exists.
    const template = templateWithBucketName({
      "Fn::Select": [
        2,
        {
          "Fn::Split": ["/", { "Fn::GetAtt": ["SiteBucket", "WebsiteURL"] }],
        },
      ],
    });

    // When the Resource templates are read, before any Resource exists.
    const properties = resolvedProperties(template);

    // Then both functions are re-emitted for the later pass to finish.
    assertObjectMatches(properties, {
      BucketName: {
        "Fn::Select": [
          2,
          {
            "Fn::Split": ["/", { "Fn::GetAtt": ["SiteBucket", "WebsiteURL"] }],
          },
        ],
      },
    });
  });

  it("leaves an unresolved index for the Resource creation pass", () => {
    // Given an index that Refs a Resource rather than a Parameter.
    const template = templateWithBucketName({
      "Fn::Select": [{ Ref: "SiteBucket" }, ["first-bucket", "second-bucket"]],
    });

    // When the Resource templates are read, before any Resource exists.
    const properties = resolvedProperties(template);

    // Then the whole function waits rather than reading the Ref as an index.
    assertObjectMatches(properties, {
      BucketName: {
        "Fn::Select": [
          { Ref: "SiteBucket" },
          ["first-bucket", "second-bucket"],
        ],
      },
    });
  });

  it("selects an unresolved list entry for the Resource creation pass", () => {
    // Given a literal list whose selected entry names a Resource attribute.
    const template = templateWithBucketName({
      "Fn::Select": [1, ["site", { "Fn::GetAtt": ["SiteBucket", "Arn"] }]],
    });

    // When the Resource templates are read, before any Resource exists.
    const properties = resolvedProperties(template);

    // Then the entry itself is what is left to resolve later.
    assertObjectMatches(properties, {
      BucketName: { "Fn::GetAtt": ["SiteBucket", "Arn"] },
    });
  });

  it("resolves against a Resource once that Resource has been created", async () => {
    // Given a Bucket named after a part of another Bucket's domain name.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
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
                "Fn::Join": [
                  "-",
                  [
                    {
                      "Fn::Select": [
                        0,
                        {
                          "Fn::Split": [
                            ".",
                            { "Fn::GetAtt": ["SiteBucket", "DomainName"] },
                          ],
                        },
                      ],
                    },
                    "logs",
                  ],
                ],
              },
            },
          },
        },
      },
    });

    // When the Stack has finished deploying.
    await stack.waitForDeployComplete();

    // Then the Fn::GetAtt inside made the read Resource a dependency.
    assertArrayEquals(stack.getResource("LogsBucket")?.dependencies(), [
      "SiteBucket",
    ]);

    // And the Bucket was created with the selected part of the domain name.
    assertNonNullable(
      simAws.s3().getSimBucketByName("site-bucket-logs"),
      "site-bucket-logs Bucket",
    );
  });
});

/**
 * A template whose Bucket name property is the value under test.
 */
function templateWithBucketName(
  bucketName: SimCfnTemplateValue,
  parameters: Record<string, { Type: string; Default: string }> = {},
): SimCfnTemplate {
  return new SimCfnTemplate({
    stackName: "test-stack",
    template: {
      Parameters: parameters,
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: bucketName },
        },
      },
    },
  });
}

function resolvedProperties(template: SimCfnTemplate): SimCfnTemplateValue {
  const resourceTemplate = template.resourceTemplates()[0];
  assertNonNullable(resourceTemplate, "TestBucket Resource template");

  const properties = resourceTemplate.template["Properties"];
  assertNonNullable(properties, "TestBucket Resource Properties");

  return properties;
}
