import { assertArrayIncludesAll, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

describe("SimSsmSdkCommandRouter", () => {
  it("names every Command simulated SSM handles", () => {
    // Given a scoped simulated SSM.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws.ssm().sdkCommandRouter().supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "PutParameterCommand",
      "GetParameterCommand",
      "GetParametersCommand",
      "GetParametersByPathCommand",
      "DeleteParameterCommand",
      "DeleteParametersCommand",
      "DescribeParametersCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated SSM.
    const simAws = new SimAws();

    // When a Systems Manager Command outside Parameter Store is looked up.
    const route = simAws.ssm().sdkCommandRouter().route("SendCommandCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });
});
