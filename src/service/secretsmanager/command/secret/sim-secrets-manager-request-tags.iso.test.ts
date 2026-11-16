import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * Create a secret carrying the tags given, as the caller given.
 */
async function createSecret(
  simAws: SimAws,
  Name: string,
  Tags: readonly { Key: string; Value: string }[],
  caller: SimAwsCaller,
): Promise<unknown> {
  return simAws
    .secretsManager()
    .createSecret(
      { input: { Name, SecretString: "s3cret", Tags } },
      { caller },
    );
}

describe("sim Secrets Manager request tags", () => {
  it("needs secretsmanager:TagResource to create a secret with tags", async () => {
    // Given a caller allowed to create secrets and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["secretsmanager:CreateSecret"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates an untagged secret and a tagged one
    await createSecret(simAws, "plain", [], caller);
    const error = await assertThrowsErrorAsync(async () =>
      createSecret(
        simAws,
        "tagged",
        [{ Key: "team", Value: "orders" }],
        caller,
      ),
    );

    // Then only the tagged secret is refused
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.secretsManager().findSecret("plain"));
    assertUndefined(simAws.secretsManager().findSecret("tagged"));
  });

  it("lets a policy decide CreateSecret on the tags it carries", async () => {
    // Given a caller allowed to create and tag secrets tagged for its own team
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["secretsmanager:CreateSecret", "secretsmanager:TagResource"],
        condition: { StringEquals: { "aws:RequestTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates a secret for its own team and one for another
    await createSecret(
      simAws,
      "orders",
      [{ Key: "team", Value: "orders" }],
      caller,
    );
    const error = await assertThrowsErrorAsync(async () =>
      createSecret(
        simAws,
        "billing",
        [{ Key: "team", Value: "billing" }],
        caller,
      ),
    );

    // Then only its own team's secret is made
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.secretsManager().findSecret("orders"));
    assertUndefined(simAws.secretsManager().findSecret("billing"));
  });
});
