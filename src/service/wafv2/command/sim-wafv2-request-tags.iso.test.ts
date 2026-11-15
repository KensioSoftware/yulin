import {
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * Create an IP set carrying the tags given, as the caller given, and answer
 * with its ARN.
 */
async function createIpSet(
  simAws: SimAws,
  Name: string,
  Tags: readonly { Key: string; Value: string }[],
  caller: SimAwsCaller,
): Promise<string | undefined> {
  const created = await simAws.wafV2().createIpSet(
    {
      input: {
        Name,
        Scope: "REGIONAL",
        IPAddressVersion: "IPV4",
        Addresses: ["192.0.2.0/24"],
        Tags,
      },
    },
    { caller },
  );

  return created.Summary?.ARN;
}

describe("sim WAFv2 request tags", () => {
  it("needs wafv2:TagResource to create an IP set with tags", async () => {
    // Given a caller allowed to create IP sets and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["wafv2:CreateIPSet"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates an untagged IP set and a tagged one
    const plain = await createIpSet(simAws, "plain", [], caller);
    const error = await assertThrowsErrorAsync(async () =>
      createIpSet(simAws, "tagged", [{ Key: "team", Value: "orders" }], caller),
    );

    // Then only the tagged IP set is refused
    assertTypeString(plain);
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("lets a policy decide CreateIPSet on the tags it carries", async () => {
    // Given a caller allowed to create and tag IP sets tagged for its own team
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["wafv2:CreateIPSet", "wafv2:TagResource"],
        condition: { StringEquals: { "aws:RequestTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates one for its own team and one for another
    const orders = await createIpSet(
      simAws,
      "orders",
      [{ Key: "team", Value: "orders" }],
      caller,
    );
    const error = await assertThrowsErrorAsync(async () =>
      createIpSet(
        simAws,
        "billing",
        [{ Key: "team", Value: "billing" }],
        caller,
      ),
    );

    // Then only its own team's IP set is made
    assertTypeString(orders);
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
