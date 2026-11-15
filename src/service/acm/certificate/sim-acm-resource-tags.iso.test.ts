import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

describe("a sim ACM certificate's tags in IAM", () => {
  it("lets a policy decide a request on the certificate's tags", async () => {
    // Given two certificates tagged for different teams, and a caller allowed
    // to describe those tagged for its own
    const simAws = new SimAws();
    const [orders, billing] = await Promise.all(
      ["orders", "billing"].map(async (team) => {
        const requested = await simAws.acm().requestCertificate({
          input: {
            DomainName: `${team}.example.com`,
            Tags: [{ Key: "team", Value: team }],
          },
        });

        return requested.CertificateArn;
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["acm:DescribeCertificate"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it describes each
    const described = await simAws
      .acm()
      .describeCertificate({ input: { CertificateArn: orders } }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .acm()
        .describeCertificate(
          { input: { CertificateArn: billing } },
          { caller },
        ),
    );

    // Then only its own team's certificate is described
    assertIdentical(described.Certificate?.DomainName, "orders.example.com");
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
