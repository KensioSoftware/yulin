import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { CfnTemplateBodyRecord } from "../../../sim-cfn-template.js";
import { SimCfnTemplate } from "../../../sim-cfn-template.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../value/sim-cfn-template-value.js";

describe("SimCfnTemplate Fn::FindInMap DefaultValue", () => {
  it("reads the mapped value where the Mappings have one", () => {
    // Given a lookup that finds its value, carrying a DefaultValue as well.
    const template = new SimCfnTemplate({
      template: lookupTemplate([
        "EnvironmentMap",
        "prod",
        "BucketName",
        { DefaultValue: "fallback-bucket" },
      ]),
    });

    // When the Resource template values are resolved.
    const resolved = resolvedTemplate(template);

    // Then the mapped value wins over the default.
    assertObjectMatches(resolved, {
      Properties: { BucketName: "production-bucket" },
    });
  });

  it("answers a missing map with the DefaultValue", () => {
    // Given a lookup naming a map the Mappings section does not carry.
    const template = new SimCfnTemplate({
      template: lookupTemplate([
        "RegionMap",
        "prod",
        "BucketName",
        { DefaultValue: "fallback-bucket" },
      ]),
    });

    // When the Resource template values are resolved.
    const resolved = resolvedTemplate(template);

    // Then the default answers instead of failing the Resource.
    assertObjectMatches(resolved, {
      Properties: { BucketName: "fallback-bucket" },
    });
  });

  it("answers a missing top level key with the DefaultValue", () => {
    // Given a lookup naming a top level key the map does not carry.
    const template = new SimCfnTemplate({
      template: lookupTemplate([
        "EnvironmentMap",
        "staging",
        "BucketName",
        { DefaultValue: "fallback-bucket" },
      ]),
    });

    // When the Resource template values are resolved.
    const resolved = resolvedTemplate(template);

    // Then the default answers.
    assertObjectMatches(resolved, {
      Properties: { BucketName: "fallback-bucket" },
    });
  });

  it("answers a missing second level key with the DefaultValue", () => {
    // Given a lookup naming a second level key the map does not carry.
    const template = new SimCfnTemplate({
      template: lookupTemplate([
        "EnvironmentMap",
        "prod",
        "QueueName",
        { DefaultValue: "fallback-bucket" },
      ]),
    });

    // When the Resource template values are resolved.
    const resolved = resolvedTemplate(template);

    // Then the default answers.
    assertObjectMatches(resolved, {
      Properties: { BucketName: "fallback-bucket" },
    });
  });

  it("resolves a DefaultValue written as an expression", () => {
    // Given a default that reads the Parameter the lookup key came from.
    const template = new SimCfnTemplate({
      template: lookupTemplate([
        "EnvironmentMap",
        { Ref: "Environment" },
        "BucketName",
        {
          DefaultValue: {
            "Fn::Join": ["-", [{ Ref: "Environment" }, "bucket"]],
          },
        },
      ]),
    });

    // When the Resource template values are resolved, with the Parameter
    // defaulting to a key the map does not carry.
    const resolved = resolvedTemplate(template);

    // Then the default resolves as any other template value does.
    assertObjectMatches(resolved, {
      Properties: { BucketName: "staging-bucket" },
    });
  });

  it("fails a missing map where no DefaultValue is given", () => {
    // Given the same missing key without a fourth argument.
    const template = new SimCfnTemplate({
      template: lookupTemplate(["RegionMap", "prod", "BucketName"]),
    });

    // When the Resource template values are resolved.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the lookup still fails, naming the path it could not find.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource SiteBucket value at Properties.BucketName: " +
        "Sim CloudFormation Fn::FindInMap could not find map RegionMap.prod",
    );
  });

  it("keeps the DefaultValue on a lookup left for a later pass", () => {
    // Given a lookup whose key only a created Resource can answer.
    const template = new SimCfnTemplate({
      template: lookupTemplate([
        "EnvironmentMap",
        { Ref: "SiteBucket" },
        "BucketName",
        { DefaultValue: "fallback-bucket" },
      ]),
    });

    // When the Resource template values are resolved.
    const resolved = resolvedTemplate(template);

    // Then the expression that is left carries the default with it.
    assertObjectMatches(resolved, {
      Properties: {
        BucketName: {
          "Fn::FindInMap": [
            "EnvironmentMap",
            { Ref: "SiteBucket" },
            "BucketName",
            { DefaultValue: "fallback-bucket" },
          ],
        },
      },
    });
  });

  it("refuses a fourth argument that is not a DefaultValue", () => {
    // Given a fourth argument naming something else.
    const template = new SimCfnTemplate({
      template: lookupTemplate([
        "EnvironmentMap",
        "prod",
        "BucketName",
        { Fallback: "fallback-bucket" },
      ]),
    });

    // When the Resource template values are resolved.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then it is refused rather than read as a default.
    assertIdentical(
      error.message,
      'Sim CloudFormation Fn::FindInMap fourth value must be { "DefaultValue": ... }',
    );
  });

  it("refuses more arguments than Fn::FindInMap takes", () => {
    // Given a fifth argument.
    const template = new SimCfnTemplate({
      template: lookupTemplate([
        "EnvironmentMap",
        "prod",
        "BucketName",
        { DefaultValue: "fallback-bucket" },
        "extra",
      ]),
    });

    // When the Resource template values are resolved.
    const error = assertThrowsError(() => template.resourceTemplates());

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::FindInMap value must be [mapName, topLevelKey, " +
        'secondLevelKey] with an optional { "DefaultValue": ... }',
    );
  });
});

/**
 * A Stack naming its Bucket after whatever the given Fn::FindInMap answers.
 */
function lookupTemplate(
  findInMap: SimCfnTemplateValue[],
): CfnTemplateBodyRecord {
  return {
    Parameters: { Environment: { Type: "String", Default: "staging" } },
    Mappings: {
      EnvironmentMap: { prod: { BucketName: "production-bucket" } },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: { "Fn::FindInMap": findInMap } },
      },
    },
  };
}

/**
 * The SiteBucket Resource template, with its values resolved.
 */
function resolvedTemplate(template: SimCfnTemplate): SimCfnTemplateValueRecord {
  const resourceTemplate = template.resourceTemplates()[0];
  assertNonNullable(resourceTemplate, "SiteBucket Resource template");

  return resourceTemplate.template;
}
