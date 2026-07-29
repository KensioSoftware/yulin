import { assertArrayIncludesAll, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

describe("SimCognitoSdkCommandRouter", () => {
  it("names every Command simulated Cognito handles", () => {
    // Given a scoped simulated Cognito.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws
      .cognitoIdentityProvider()
      .sdkCommandRouter()
      .supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateUserPoolCommand",
      "DescribeUserPoolCommand",
      "DeleteUserPoolCommand",
      "ListUserPoolsCommand",
      "CreateUserPoolClientCommand",
      "DescribeUserPoolClientCommand",
      "DeleteUserPoolClientCommand",
      "ListUserPoolClientsCommand",
      "AdminCreateUserCommand",
      "AdminGetUserCommand",
      "AdminDeleteUserCommand",
      "AdminSetUserPasswordCommand",
      "AdminUpdateUserAttributesCommand",
      "AdminDisableUserCommand",
      "AdminEnableUserCommand",
      "ListUsersCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated Cognito.
    const simAws = new SimAws();

    // When a user pool Command this simulation does not support is looked up.
    const route = simAws
      .cognitoIdentityProvider()
      .sdkCommandRouter()
      .route("AdminInitiateAuthCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });
});
