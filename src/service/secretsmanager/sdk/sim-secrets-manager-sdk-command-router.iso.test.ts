import { assertArrayIncludesAll, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

describe("SimSecretsManagerSdkCommandRouter", () => {
  it("names every Command simulated Secrets Manager handles", () => {
    // Given a scoped simulated Secrets Manager.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws
      .secretsManager()
      .sdkCommandRouter()
      .supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateSecretCommand",
      "DescribeSecretCommand",
      "UpdateSecretCommand",
      "ListSecretsCommand",
      "GetSecretValueCommand",
      "PutSecretValueCommand",
      "DeleteSecretCommand",
      "RestoreSecretCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated Secrets Manager.
    const simAws = new SimAws();

    // When an unsupported Command name is looked up.
    const route = simAws
      .secretsManager()
      .sdkCommandRouter()
      .route("RotateSecretCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });
});
