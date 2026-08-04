import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import { SimCfnTemplate } from "../sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";

describe("SimCfnTemplate Conditions refusals", () => {
  it("refuses a Condition that only a created Resource could evaluate", () => {
    // Given a Condition comparing a Resource attribute.
    const conditions = {
      IsNamed: {
        "Fn::Equals": [{ "Fn::GetAtt": ["SiteBucket", "Arn"] }, "arn:aws:s3"],
      },
    };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the Condition fails rather than quietly reading false.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsNamed " +
        'Fn::Equals cannot compare {"Fn::GetAtt":["SiteBucket","Arn"]}, ' +
        "which does not resolve from Parameters alone",
    );
  });

  it("refuses a Condition that refers back to itself", () => {
    // Given two Conditions that name each other.
    const conditions = {
      IsProd: { "Fn::Not": [{ Condition: "IsNotProd" }] },
      IsNotProd: { "Fn::Not": [{ Condition: "IsProd" }] },
    };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the cycle is named rather than recursing.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd refers to " +
        "itself through IsProd -> IsNotProd -> IsProd",
    );
  });

  it("refuses a Condition naming one the template does not define", () => {
    // Given a Condition naming a Condition that is not in the section.
    const conditions = { IsProd: { "Fn::Not": [{ Condition: "IsStaging" }] } };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the missing Condition is named.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsStaging is not " +
        "defined in the template Conditions",
    );
  });

  it("refuses a condition function it does not evaluate", () => {
    // Given a Condition built from an unsupported function.
    const conditions = { IsProd: { "Fn::Contains": [["prod"], "prod"] } };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the function is named rather than ignored.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd uses " +
        "Fn::Contains, which is not a condition function this simulation " +
        "evaluates",
    );
  });

  it("refuses a Condition that is not a single function object", () => {
    // Given a Condition carrying two functions at once.
    const conditions = {
      IsProd: {
        "Fn::Equals": [{ Ref: "EnvName" }, "prod"],
        "Fn::Not": [{ "Fn::Equals": [{ Ref: "EnvName" }, "dev"] }],
      },
    };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the Condition is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd must be a " +
        "single condition function object",
    );
  });

  it("refuses an Fn::Equals that does not compare exactly two values", () => {
    // Given an Fn::Equals with three values.
    const conditions = {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod", "staging"] },
    };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd Fn::Equals " +
        "must be a list of exactly two values",
    );
  });

  it("refuses an Fn::And with fewer than two conditions", () => {
    // Given an Fn::And over one condition.
    const conditions = {
      IsProd: { "Fn::And": [{ "Fn::Equals": [{ Ref: "EnvName" }, "prod"] }] },
    };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd Fn::And " +
        "must be a list of at least two conditions",
    );
  });

  it("refuses an Fn::Not over more than one condition", () => {
    // Given an Fn::Not over two conditions.
    const conditions = {
      IsProd: {
        "Fn::Not": [
          { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
          { "Fn::Equals": [{ Ref: "EnvName" }, "dev"] },
        ],
      },
    };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd Fn::Not " +
        "must be a list of exactly one condition",
    );
  });

  it("refuses an Fn::Equals that is not a list", () => {
    // Given an Fn::Equals carrying an object.
    const conditions = { IsProd: { "Fn::Equals": { Ref: "EnvName" } } };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd Fn::Equals " +
        "must be a list",
    );
  });

  it("refuses a Condition that is not an object", () => {
    // Given a Condition written as a bare string.
    const conditions = { IsProd: "prod" };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd must be an " +
        "object",
    );
  });

  it("refuses a Condition reference that is not a string", () => {
    // Given a Condition reference carrying an object.
    const conditions = {
      IsProd: { "Fn::Not": [{ Condition: { Ref: "EnvName" } }] },
    };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then the shape is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Condition IsProd Condition " +
        "reference must be a string",
    );
  });

  it("refuses Fn::If inside the Conditions section", () => {
    // Given a Condition built from Fn::If, which needs the very Conditions
    // being evaluated.
    const conditions = {
      IsProd: {
        "Fn::Equals": [{ "Fn::If": ["IsProd", "a", "b"] }, "a"],
      },
    };

    // When the Conditions are evaluated.
    const error = assertThrowsError(() => {
      evaluateWith(conditions);
    });

    // Then it is refused rather than reading a half-evaluated section.
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::If IsProd cannot be resolved where the " +
        "template Conditions are not available",
    );
  });

  it("refuses a Conditions section that is not an object", () => {
    // Given a template whose Conditions section is a list.
    // When the template is read.
    const error = assertThrowsError(
      () =>
        new SimCfnTemplate({
          stackName: "conditions-stack",
          template: {
            Conditions: [] as unknown as Record<string, SimCfnTemplateValue>,
            Resources: {},
          },
        }),
    );

    // Then the section is refused.
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack conditions-stack Conditions must be an object",
    );
  });
});

/**
 * Evaluate a Conditions section against one EnvName Parameter value.
 */
function evaluateWith(conditions: Record<string, SimCfnTemplateValue>): void {
  new SimCfnTemplate({
    stackName: "conditions-stack",
    template: {
      Parameters: { EnvName: { Type: "String" } },
      Conditions: conditions,
      Resources: {},
    },
    parameters: SimCfnParameters.fromValues({ EnvName: "prod" }),
  }).conditions();
}
