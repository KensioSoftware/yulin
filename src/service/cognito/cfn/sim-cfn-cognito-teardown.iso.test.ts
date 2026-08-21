import {
  assertIdentical,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "../../aws/sim-aws.js";

describe("Cognito CloudFormation Resource teardown", () => {
  it("deletes a user pool after the client and group in it", async () => {
    // Given a deployed user pool with an app client and a group.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          AppPool: {
            Type: "AWS::Cognito::UserPool",
            Properties: { UserPoolName: "myapp-users" },
          },
          AppClient: {
            Type: "AWS::Cognito::UserPoolClient",
            Properties: {
              UserPoolId: { Ref: "AppPool" },
              ClientName: "web",
            },
          },
          AdminsGroup: {
            Type: "AWS::Cognito::UserPoolGroup",
            Properties: {
              UserPoolId: { Ref: "AppPool" },
              GroupName: "admins",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const userPoolId = stack.getResource("AppPool")?.refValue;
    assertTypeString(userPoolId);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the pool is gone, and so is everything that was in it.
    await assertThrowsErrorAsync(async () =>
      simAws
        .cognitoIdentityProvider()
        .describeUserPool(
          new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
        ),
    );
    for (const logicalId of ["AdminsGroup", "AppClient", "AppPool"]) {
      assertIdentical(
        stack.getResource(logicalId)?.status,
        "DELETE_COMPLETE",
        `${logicalId} status`,
      );
    }
  });
});
