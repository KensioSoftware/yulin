import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

describe("a sim SES identity's tags in IAM", () => {
  it("lets a policy decide a request on the identity's tags", async () => {
    // Given two domain identities tagged for different teams, and a caller
    // allowed to read those tagged for its own
    const simAws = new SimAws();
    for (const team of ["orders", "billing"]) {
      // oxlint-disable-next-line no-await-in-loop -- created in order
      await simAws.sesV2().createEmailIdentity({
        input: {
          EmailIdentity: `${team}.example.com`,
          Tags: [{ Key: "team", Value: team }],
        },
      });
    }
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["ses:GetEmailIdentity"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it reads each
    const read = await simAws
      .sesV2()
      .getEmailIdentity(
        { input: { EmailIdentity: "orders.example.com" } },
        { caller },
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .sesV2()
        .getEmailIdentity(
          { input: { EmailIdentity: "billing.example.com" } },
          { caller },
        ),
    );

    // Then only its own team's identity is read
    assertIdentical(read.IdentityType, "DOMAIN");
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
