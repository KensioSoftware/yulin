import {
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimSecretsManagerSecret } from "../secret/sim-secrets-manager-secret.js";

describe("Secrets Manager CloudFormation Resource teardown", () => {
  it("schedules the secret for deletion rather than removing it", async () => {
    // Given a deployed secret. DeleteSecret starts a recovery window rather
    // than taking the secret away, which is what CloudFormation leaves behind.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "secret-stack",
      template: {
        Resources: {
          ApiSecret: {
            Type: "AWS::SecretsManager::Secret",
            Properties: {
              Name: "api-key",
              SecretString: "s3cret",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const secret = stack.resources.get("ApiSecret")?.simResource as
      | SimSecretsManagerSecret
      | undefined;
    assertNonNullable(secret);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the secret is waiting out its recovery window.
    assertTrue(secret.isScheduledForDeletion);
    assertIdentical(
      stack.resources.get("ApiSecret")?.status,
      "DELETE_COMPLETE",
    );
  });
});
