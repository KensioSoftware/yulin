import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnTemplate } from "../../../sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../value/sim-cfn-template-value.js";

describe("SimCfnTemplate Fn::Split", () => {
  it("splits a literal string on the delimiter", () => {
    // Given a Resource property splitting a URL on slashes.
    const template = templateWithTags({
      "Fn::Split": ["/", "https://example.com/site/index.html"],
    });

    // When the Resource templates are read.
    const properties = resolvedProperties(template);

    // Then the property is the list of parts, empty parts included.
    assertObjectMatches(properties, {
      Tags: ["https:", "", "example.com", "site", "index.html"],
    });
  });

  it("splits a value read from a Parameter", () => {
    // Given a delimiter-separated Parameter value.
    const template = templateWithTags(
      { "Fn::Split": [",", { Ref: "Names" }] },
      { Names: { Type: "String", Default: "alpha,beta" } },
    );

    // When the Resource templates are read.
    const properties = resolvedProperties(template);

    // Then the Parameter value is split.
    assertObjectMatches(properties, { Tags: ["alpha", "beta"] });
  });

  it("splits on a delimiter the string does not contain", () => {
    // Given a string with no delimiter in it.
    const template = templateWithTags({ "Fn::Split": ["|", "one-value"] });

    // When the Resource templates are read.
    const properties = resolvedProperties(template);

    // Then the whole string is the only element, as CloudFormation gives it.
    assertObjectMatches(properties, { Tags: ["one-value"] });
  });

  it("leaves an Fn::GetAtt source for the Resource creation pass", () => {
    // Given a source that names a Resource attribute.
    const template = templateWithTags({
      "Fn::Split": ["/", { "Fn::GetAtt": ["SiteBucket", "WebsiteURL"] }],
    });

    // When the Resource templates are read, before any Resource exists.
    const properties = resolvedProperties(template);

    // Then the function is re-emitted for the later pass to finish.
    assertObjectMatches(properties, {
      Tags: {
        "Fn::Split": ["/", { "Fn::GetAtt": ["SiteBucket", "WebsiteURL"] }],
      },
    });
  });

  it("leaves a Resource Ref source for the Resource creation pass", () => {
    // Given a source that Refs a Resource rather than a Parameter.
    const template = templateWithTags({
      "Fn::Split": ["/", { Ref: "SiteBucket" }],
    });

    // When the Resource templates are read, before any Resource exists.
    const properties = resolvedProperties(template);

    // Then the unresolved Ref is kept inside the re-emitted function.
    assertObjectMatches(properties, {
      Tags: { "Fn::Split": ["/", { Ref: "SiteBucket" }] },
    });
  });

  it("refuses a source that does not resolve to a string", () => {
    // Given a source that is a number.
    const template = templateWithTags({ "Fn::Split": ["/", 42] });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the refusal names the Resource and the property.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.Tags: " +
        "Sim CloudFormation Fn::Split source must resolve to a string, got number",
    );
  });

  it("refuses a source that resolves to an object", () => {
    // Given a source that is an object rather than an expression.
    const template = templateWithTags({
      "Fn::Split": ["/", { Name: "site", Region: "eu-west-2" }],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then it is refused rather than treated as unresolved work.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.Tags: " +
        "Sim CloudFormation Fn::Split source must resolve to a string, got object",
    );
  });

  it("refuses a single-key object source that is not an intrinsic", () => {
    // Given a one-key object, which has the shape of an unresolved function.
    const template = templateWithTags({
      "Fn::Split": ["/", { Name: "site" }],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the key is what decides it, so this is still the wrong type.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.Tags: " +
        "Sim CloudFormation Fn::Split source must resolve to a string, got object",
    );
  });

  it("refuses an Fn::Split that is not a two-item list", () => {
    // Given an Fn::Split missing its source string.
    const template = templateWithTags({ "Fn::Split": ["/"] });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the expected shape is named.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Split value must be [delimiter, sourceString]",
    );
  });

  it("refuses an Fn::Split delimiter that is not a string", () => {
    // Given a delimiter that is not a literal string.
    const template = templateWithTags({
      "Fn::Split": [{ Ref: "Delimiter" }, "a-b"],
    });

    // When the Resource templates are read.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then it is refused, as CloudFormation requires a literal delimiter.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Split delimiter must be a string",
    );
  });
});

/**
 * A template whose Bucket Tags property is the value under test.
 */
function templateWithTags(
  tags: SimCfnTemplateValue,
  parameters: Record<string, { Type: string; Default: string }> = {},
): SimCfnTemplate {
  return new SimCfnTemplate({
    stackName: "test-stack",
    template: {
      Parameters: parameters,
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "test-bucket", Tags: tags },
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
