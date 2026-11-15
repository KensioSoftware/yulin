import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

describe("a sim WAFv2 resource's tags in IAM", () => {
  it("lets a policy decide a request on the IP set's tags", async () => {
    // Given two IP sets tagged for different teams, and a caller allowed to
    // read those tagged for its own
    const simAws = new SimAws();
    const [orders, billing] = await Promise.all(
      ["orders", "billing"].map(async (team) => {
        const created = await simAws.wafV2().createIpSet({
          input: {
            Name: team,
            Scope: "REGIONAL",
            IPAddressVersion: "IPV4",
            Addresses: ["192.0.2.0/24"],
            Tags: [{ Key: "team", Value: team }],
          },
        });

        return { Name: team, Scope: "REGIONAL", Id: created.Summary?.Id };
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["wafv2:GetIPSet"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it reads each
    const read = await simAws
      .wafV2()
      .getIpSet({ input: { ...orders } }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws.wafV2().getIpSet({ input: { ...billing } }, { caller }),
    );

    // Then only its own team's IP set is read
    assertIdentical(read.IPSet?.Name, "orders");
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
