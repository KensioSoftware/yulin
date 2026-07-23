import {
  assertArrayLength,
  assertIdentical,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnFnSubTemplate as SimCfnFunctionSubTemplate } from "./sim-cfn-fn-sub-template.js";

/* eslint-disable no-template-curly-in-string */

describe("SimAws CloudFormation Fn::Sub template string", () => {
  it("returns no variable names for a template without substitutions", () => {
    // Given a template string with no Fn::Sub variables.
    const template = new SimCfnFunctionSubTemplate("plain-bucket-name");

    // When the variable names are read.
    const variableNames = template.variableNames();

    // Then no variable names are returned.
    assertArrayLength(variableNames, 0);
  });

  it("returns unique non-escaped variable names in first-seen order", () => {
    // Given a template string with repeated and escaped variables.
    const template = new SimCfnFunctionSubTemplate(
      "${Prefix}-${Name}-${Prefix}-${!Literal}",
    );

    // When the variable names are read.
    const variableNames = template.variableNames();

    // Then repeated names are deduplicated and escaped names are ignored.
    assertArrayLength(variableNames, 2);
    assertIdentical(variableNames[0], "Prefix");
    assertIdentical(variableNames[1], "Name");
  });

  it("substitutes every matching variable occurrence", () => {
    // Given a template string with repeated variables.
    const template = new SimCfnFunctionSubTemplate(
      "${Prefix}-${Name}-${Prefix}",
    );

    // When resolved values are substituted.
    const resolved = template.substitute(
      new Map([
        ["Prefix", "my"],
        ["Name", "bucket"],
      ]),
    );

    // Then every variable occurrence is replaced.
    assertIdentical(resolved, "my-bucket-my");
  });

  it("keeps escaped variables literal during substitution", () => {
    // Given a template string with an escaped Fn::Sub variable.
    const template = new SimCfnFunctionSubTemplate("literal-${!Name}-${Name}");

    // When resolved values are substituted.
    const resolved = template.substitute(new Map([["Name", "bucket"]]));

    // Then the escaped variable is emitted literally.
    assertIdentical(resolved, "literal-${Name}-bucket");
  });

  it("returns logical names with attribute suffixes removed", () => {
    // Given a template string with Ref-style and GetAtt-style variables.
    const template = new SimCfnFunctionSubTemplate(
      "${Bucket}-${Distribution.DomainName}",
    );

    // When logical names are read.
    const logicalNames = template.logicalNames();

    // Then attribute suffixes are removed.
    assertArrayLength(logicalNames, 2);
    assertIdentical(logicalNames[0], "Bucket");
    assertIdentical(logicalNames[1], "Distribution");
  });

  it("throws when a substitution variable has no resolved value", () => {
    // Given a template string with a variable.
    const template = new SimCfnFunctionSubTemplate("${Name}");

    // When substitution runs without that variable, then it throws.
    const error = assertThrowsError(() => {
      template.substitute(new Map());
    });

    // Then the missing variable is named in the error.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Sub variable Name was not resolved",
    );
  });
});
