import {
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * Request a certificate carrying the tags given, as the caller given, and
 * answer with its ARN.
 */
async function request(
  simAws: SimAws,
  Tags: readonly { Key: string; Value: string }[],
  caller: SimAwsCaller,
): Promise<string | undefined> {
  const requested = await simAws
    .acm()
    .requestCertificate(
      { input: { DomainName: "www.example.com", Tags } },
      { caller },
    );

  return requested.CertificateArn;
}

describe("sim ACM request tags", () => {
  it("needs acm:AddTagsToCertificate to request a certificate with tags", async () => {
    // Given a caller allowed to request certificates and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["acm:RequestCertificate"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it requests an untagged certificate and a tagged one
    const plain = await request(simAws, [], caller);
    const error = await assertThrowsErrorAsync(async () =>
      request(simAws, [{ Key: "team", Value: "orders" }], caller),
    );

    // Then only the tagged request is refused
    assertTypeString(plain);
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("lets a policy decide RequestCertificate on the tags it carries", async () => {
    // Given a caller allowed to request and tag certificates tagged for its
    // own team
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["acm:RequestCertificate", "acm:AddTagsToCertificate"],
        condition: { StringEquals: { "aws:RequestTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it requests one for its own team and one for another
    const orders = await request(
      simAws,
      [{ Key: "team", Value: "orders" }],
      caller,
    );
    const error = await assertThrowsErrorAsync(async () =>
      request(simAws, [{ Key: "team", Value: "billing" }], caller),
    );

    // Then only its own team's certificate is requested
    assertTypeString(orders);
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
