import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { GetParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "../../aws/sim-aws.js";

describe("SSM CloudFormation Resource teardown", () => {
  it("deletes the Parameter a Stack created", async () => {
    // Given a deployed Parameter.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: {
        Resources: {
          ApiUrlParameter: {
            Type: "AWS::SSM::Parameter",
            Properties: {
              Name: "/app/api-url",
              Type: "String",
              Value: "https://api.example.test",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then Parameter Store no longer holds it.
    await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(new GetParameterCommand({ Name: "/app/api-url" })),
    );
    assertIdentical(
      stack.resources.get("ApiUrlParameter")?.status,
      "DELETE_COMPLETE",
    );
  });
});
