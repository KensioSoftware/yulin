import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../../aws/sim-aws-region.js";
import { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import { SimCfnTemplate } from "../sim-cfn-template.js";
import type {
  SimCfnConditions,
  SimCfnConditionsSection,
} from "./sim-cfn-conditions.js";

describe("SimCfnTemplate Conditions", () => {
  it("evaluates Fn::Equals over a Parameter as true", () => {
    // Given a Condition comparing a Parameter to a literal.
    const conditions = {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
    };

    // When the Stack is deployed with the value it compares against.
    const evaluated = evaluateWith(conditions, "prod");

    // Then the Condition is true.
    assertTrue(evaluated.value("IsProd"));
  });

  it("evaluates Fn::Equals over a Parameter as false", () => {
    // Given a Condition comparing a Parameter to a literal.
    const conditions = {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
    };

    // When the Stack is deployed with a different value.
    const evaluated = evaluateWith(conditions, "dev");

    // Then the Condition is false.
    assertFalse(evaluated.value("IsProd"));
  });

  it("compares a Parameter against a pseudo parameter", () => {
    // Given a Condition comparing the Stack Region to a Parameter.
    const conditions = {
      IsHomeRegion: {
        "Fn::Equals": [{ Ref: "AWS::Region" }, { Ref: "EnvName" }],
      },
    };

    // When the Stack is deployed with the Region it runs in.
    const evaluated = evaluateWith(conditions, DEFAULT_SIM_AWS_REGION_NAME);

    // Then the Condition is true.
    assertTrue(evaluated.value("IsHomeRegion"));
  });

  it("compares a template number against a Parameter string", () => {
    // Given a Condition comparing a Parameter to a JSON number.
    const conditions = { IsTwo: { "Fn::Equals": [{ Ref: "EnvName" }, 2] } };

    // When the Stack is deployed with that number as a Parameter value.
    const evaluated = evaluateWith(conditions, "2");

    // Then the Condition is true, as CloudFormation compares template values
    // as the strings they arrive as.
    assertTrue(evaluated.value("IsTwo"));
  });

  it("inverts a Condition with Fn::Not", () => {
    // Given a Condition negating a comparison.
    const conditions = {
      IsNotProd: {
        "Fn::Not": [{ "Fn::Equals": [{ Ref: "EnvName" }, "prod"] }],
      },
    };

    // When the Stack is deployed with a different value.
    const evaluated = evaluateWith(conditions, "dev");

    // Then the Condition is true.
    assertTrue(evaluated.value("IsNotProd"));
  });

  it("composes Conditions by name with Fn::And", () => {
    // Given a Condition that names two other Conditions.
    const conditions = {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
      IsNamed: { "Fn::Not": [{ "Fn::Equals": [{ Ref: "EnvName" }, ""] }] },
      IsNamedProd: {
        "Fn::And": [{ Condition: "IsProd" }, { Condition: "IsNamed" }],
      },
    };

    // When the Stack is deployed with a value both agree on.
    const evaluated = evaluateWith(conditions, "prod");

    // Then the composed Condition is true.
    assertTrue(evaluated.value("IsNamedProd"));
  });

  it("evaluates Fn::And as false when one named Condition is false", () => {
    // Given a Condition that names two other Conditions.
    const conditions = {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
      IsStaging: { "Fn::Equals": [{ Ref: "EnvName" }, "staging"] },
      IsBoth: {
        "Fn::And": [{ Condition: "IsProd" }, { Condition: "IsStaging" }],
      },
    };

    // When the Stack is deployed with a value only one of them agrees on.
    const evaluated = evaluateWith(conditions, "prod");

    // Then the composed Condition is false.
    assertFalse(evaluated.value("IsBoth"));
  });

  it("composes Conditions by name with Fn::Or", () => {
    // Given a Condition that accepts either of two other Conditions.
    const conditions = {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
      IsStaging: { "Fn::Equals": [{ Ref: "EnvName" }, "staging"] },
      IsDeployed: {
        "Fn::Or": [{ Condition: "IsProd" }, { Condition: "IsStaging" }],
      },
    };

    // When the Stack is deployed with a value one of them agrees on.
    const evaluated = evaluateWith(conditions, "staging");

    // Then the composed Condition is true.
    assertTrue(evaluated.value("IsDeployed"));

    // And a value neither agrees on leaves it false.
    assertFalse(evaluateWith(conditions, "dev").value("IsDeployed"));
  });

  it("composes the ten conditions Fn::Or accepts", () => {
    // Given an Fn::Or over the most conditions CloudFormation allows, the last
    // of which matches.
    const conditions = {
      IsKnownEnv: {
        "Fn::Or": Array.from({ length: 10 }, (_, index) => ({
          "Fn::Equals": [{ Ref: "EnvName" }, `env-${String(index)}`],
        })),
      },
    };

    // When the Stack is deployed with that value.
    const evaluated = evaluateWith(conditions, "env-9");

    // Then the Condition is true.
    assertTrue(evaluated.value("IsKnownEnv"));
  });

  it("evaluates a Condition named before the one it depends on", () => {
    // Given a Condition named ahead of the Condition it reads, as a template
    // section carries no ordering.
    const conditions = {
      IsNotProd: { "Fn::Not": [{ Condition: "IsProd" }] },
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
    };

    // When the Stack is deployed.
    const evaluated = evaluateWith(conditions, "dev");

    // Then both Conditions are evaluated.
    assertTrue(evaluated.value("IsNotProd"));
    assertFalse(evaluated.value("IsProd"));
  });

  it("picks a condition with Fn::If", () => {
    // Given a Condition that chooses between two conditions by a third.
    const conditions = {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
      IsBackedUp: {
        "Fn::If": [
          "IsProd",
          { "Fn::Equals": ["nightly", "nightly"] },
          { "Fn::Equals": ["never", "nightly"] },
        ],
      },
    };

    // When the Stack is deployed with the value the chooser agrees with.
    const evaluated = evaluateWith(conditions, "prod");

    // Then the branch it selected is the one that answered.
    assertTrue(evaluated.value("IsBackedUp"));

    // And another value takes the other branch.
    assertFalse(evaluateWith(conditions, "dev").value("IsBackedUp"));
  });

  it("evaluates an Fn::If naming a Condition written below it", () => {
    // Given an Fn::If whose chooser and branches all name Conditions the
    // section carries further down, as a template section has no ordering.
    const conditions = {
      IsBackedUp: {
        "Fn::If": ["IsProd", { Condition: "IsNamed" }, { Condition: "IsProd" }],
      },
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
      IsNamed: { "Fn::Not": [{ "Fn::Equals": [{ Ref: "EnvName" }, ""] }] },
    };

    // When the Stack is deployed as prod.
    const evaluated = evaluateWith(conditions, "prod");

    // Then the Fn::If answers with the Condition its true branch names.
    assertTrue(evaluated.value("IsBackedUp"));
  });

  it("reads a template with no Conditions section", () => {
    // Given a template with no Conditions.
    const template = new SimCfnTemplate({ template: { Resources: {} } });

    // When its Conditions are read.
    const evaluated = template.conditions();

    // Then nothing is defined.
    assertFalse(evaluated.has("IsProd"));
  });
});

/**
 * Evaluate a Conditions section against one EnvName Parameter value.
 */
function evaluateWith(
  conditions: SimCfnConditionsSection,
  environmentName: string,
): SimCfnConditions {
  return new SimCfnTemplate({
    stackName: "conditions-stack",
    template: {
      Parameters: { EnvName: { Type: "String" } },
      Conditions: conditions,
      Resources: {},
    },
    parameters: SimCfnParameters.fromValues({ EnvName: environmentName }),
  }).conditions();
}
