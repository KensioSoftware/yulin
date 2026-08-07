import {
  assertFalse,
  assertIdentical,
  assertMapSize,
  assertObjectEquals,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimLambdaEnvironment } from "./sim-lambda-environment.js";

describe("sim Lambda environment", () => {
  it("provides the AWS runtime variables when nothing is declared", () => {
    // Given an environment for a function that declares no variables.
    const environment = new SimLambdaEnvironment({
      functionName: "greeter",
      regionName: "eu-west-2",
      memorySizeMb: 256,
    });

    // When its variables are read.
    const variables = environment.variables();

    // Then only the AWS-provided runtime variables are there.
    assertObjectEquals(variables, {
      AWS_REGION: "eu-west-2",
      AWS_DEFAULT_REGION: "eu-west-2",
      AWS_LAMBDA_FUNCTION_NAME: "greeter",
      AWS_LAMBDA_FUNCTION_MEMORY_SIZE: "256",
      AWS_LAMBDA_FUNCTION_VERSION: "$LATEST",
    });
    assertFalse(environment.hasDeclaredVariables);
  });

  it("merges declared variables with the AWS runtime variables", () => {
    // Given an environment declaring variables of its own.
    const environment = new SimLambdaEnvironment({
      functionName: "greeter",
      regionName: "eu-west-2",
      memorySizeMb: 128,
      declaredVariables: new Map([
        ["TABLE_NAME", "widgets"],
        ["GREETING", "Hello"],
      ]),
    });

    // When its variables are read.
    const variables = environment.variables();

    // Then the declared variables sit alongside the AWS-provided ones.
    assertIdentical(variables["TABLE_NAME"], "widgets");
    assertIdentical(variables["GREETING"], "Hello");
    assertIdentical(variables["AWS_LAMBDA_FUNCTION_NAME"], "greeter");
    assertTrue(environment.hasDeclaredVariables);
  });

  it("reports the declared variables without the AWS-provided ones", () => {
    // Given an environment declaring one variable.
    const environment = new SimLambdaEnvironment({
      functionName: "greeter",
      regionName: "eu-west-2",
      memorySizeMb: 128,
      declaredVariables: new Map([["TABLE_NAME", "widgets"]]),
    });

    // When the declared variables are read.
    const declared = environment.declaredVariables;

    // Then the AWS-provided runtime variables are not among them.
    assertMapSize(declared, 1);
    assertIdentical(declared.get("TABLE_NAME"), "widgets");
    assertIdentical(environment.functionName, "greeter");
  });

  it("reuses one variables object, as a warm execution environment does", () => {
    // Given an environment that has already been read from.
    const environment = new SimLambdaEnvironment({
      functionName: "greeter",
      regionName: "eu-west-2",
      memorySizeMb: 128,
      declaredVariables: new Map([["TABLE_NAME", "widgets"]]),
    });
    const variables = environment.variables();

    // When function code writes to it, as it could to process.env.
    variables["WRITTEN_AT_RUNTIME"] = "yes";

    // Then the next read of the same environment still sees the write.
    assertIdentical(environment.variables()["WRITTEN_AT_RUNTIME"], "yes");
  });
});
