import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";
import {
  simLambdaFunctionReferenceOf,
  simLambdaQualifiedFunctionOf,
} from "./sim-lambda-function-reference.js";

const functionArn = "arn:aws:lambda:eu-west-2:111111111111:function:orders";

describe("sim Lambda function reference", () => {
  it("reads a bare function name", () => {
    // When a name on its own is read.
    const reference = simLambdaFunctionReferenceOf("orders");

    // Then it names the function and no version.
    assertIdentical(reference.functionName, "orders");
    assertUndefined(reference.qualifier);
  });

  it("reads a qualifier appended to a name", () => {
    // When a name with a qualifier is read.
    const reference = simLambdaFunctionReferenceOf("orders:live");

    // Then both parts come back.
    assertIdentical(reference.functionName, "orders");
    assertIdentical(reference.qualifier, "live");
  });

  it("reads a function ARN, qualified or not", () => {
    // When each form of ARN is read.
    const unqualified = simLambdaFunctionReferenceOf(functionArn);
    const qualified = simLambdaFunctionReferenceOf(`${functionArn}:2`);

    // Then the name comes off both, and the qualifier off the one that has it.
    assertIdentical(unqualified.functionName, "orders");
    assertUndefined(unqualified.qualifier);
    assertIdentical(qualified.functionName, "orders");
    assertIdentical(qualified.qualifier, "2");
  });

  it("takes the qualifier a request asked for over none on the name", () => {
    // When a request names a function and asks for a version.
    const reference = simLambdaQualifiedFunctionOf("orders", "live");

    // Then the version it asked for is the one to run.
    assertIdentical(reference.functionName, "orders");
    assertIdentical(reference.qualifier, "live");
  });

  it("takes the qualifier off the name when the request asks for none", () => {
    // When a request names a qualified function and asks for nothing.
    const reference = simLambdaQualifiedFunctionOf(
      `${functionArn}:live`,
      undefined,
    );

    // Then the qualifier on the name is the one to run.
    assertIdentical(reference.qualifier, "live");
  });

  it("allows a request that asks for the qualifier it named", () => {
    // When a request qualifies the name and asks for the same qualifier.
    const reference = simLambdaQualifiedFunctionOf("orders:live", "live");

    // Then the two agreeing is not a conflict.
    assertIdentical(reference.qualifier, "live");
  });

  it("refuses a request whose name and qualifier disagree", () => {
    // When a request qualifies the name one way and asks for another.
    const error = assertThrowsError(() =>
      simLambdaQualifiedFunctionOf("orders:live", "2"),
    );

    // Then it is refused rather than one of the two being picked.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "does not match");
  });
});
