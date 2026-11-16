import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import { SimAws } from "../aws/sim-aws.js";
import { SimIamAccessDenied } from "../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * Create an email identity carrying the tags given, as the caller given.
 */
async function createIdentity(
  simAws: SimAws,
  EmailIdentity: string,
  Tags: readonly { Key: string; Value: string }[],
  caller: SimAwsCaller,
): Promise<unknown> {
  return simAws
    .sesV2()
    .createEmailIdentity({ input: { EmailIdentity, Tags } }, { caller });
}

describe("sim SES request tags", () => {
  it("needs ses:TagResource to create an identity with tags", async () => {
    // Given a caller allowed to create identities and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["ses:CreateEmailIdentity"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates an untagged identity and a tagged one
    await createIdentity(simAws, "plain.example.com", [], caller);
    const error = await assertThrowsErrorAsync(async () =>
      createIdentity(
        simAws,
        "tagged.example.com",
        [{ Key: "team", Value: "orders" }],
        caller,
      ),
    );

    // Then only the tagged identity is refused
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.sesV2().findIdentity("plain.example.com"));
    assertUndefined(simAws.sesV2().findIdentity("tagged.example.com"));
  });

  it("lets a policy decide CreateEmailIdentity on the tags it carries", async () => {
    // Given a caller allowed to create and tag identities tagged for its own
    // team
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["ses:CreateEmailIdentity", "ses:TagResource"],
        condition: { StringEquals: { "aws:RequestTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates one for its own team and one for another
    await createIdentity(
      simAws,
      "orders.example.com",
      [{ Key: "team", Value: "orders" }],
      caller,
    );
    const error = await assertThrowsErrorAsync(async () =>
      createIdentity(
        simAws,
        "billing.example.com",
        [{ Key: "team", Value: "billing" }],
        caller,
      ),
    );

    // Then only its own team's identity is made
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.sesV2().findIdentity("orders.example.com"));
    assertUndefined(simAws.sesV2().findIdentity("billing.example.com"));
  });
});
