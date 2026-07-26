import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCfnLambdaTargetFunctionName } from "./sim-cfn-lambda-target-function.js";

describe("AWS::Lambda::Url target function name", () => {
  it("takes the function name out of a function ARN", () => {
    // Given a TargetFunctionArn from Fn::GetAtt on the function.
    const targetFunctionArn =
      "arn:aws:lambda:eu-west-2:111111111111:function:greeter";

    // When the target function name is read.
    const functionName = simCfnLambdaTargetFunctionName(targetFunctionArn);

    // Then it is the function the ARN names.
    assertIdentical(functionName, "greeter");
  });

  it("drops a version or alias qualifier", () => {
    // Given a qualified function ARN.
    const targetFunctionArn =
      "arn:aws:lambda:eu-west-2:111111111111:function:greeter:live";

    // When the target function name is read.
    const functionName = simCfnLambdaTargetFunctionName(targetFunctionArn);

    // Then the qualifier is dropped, as qualified URLs are not simulated.
    assertIdentical(functionName, "greeter");
  });

  it("accepts a bare function name", () => {
    // Given a TargetFunctionArn from a Ref, which is the function name.
    const targetFunctionArn = "greeter";

    // When the target function name is read.
    const functionName = simCfnLambdaTargetFunctionName(targetFunctionArn);

    // Then it is used as it is.
    assertIdentical(functionName, "greeter");
  });
});
