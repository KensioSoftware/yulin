import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { GetWebACLCommand, ListWebACLsCommand } from "@aws-sdk/client-wafv2";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simWafCreateWebAclFactory } from "../web-acl/sim-waf-create-web-acl.factory.js";
import { createSimWafWebAcl } from "../../sim-wafv2.fixture.js";

const accountIdOneOnes = "111111111111";

/**
 * A simulation with one Role, and whatever policy statement the test wants it
 * to have.
 */
async function simAwsWithRole(policyStatement?: object): Promise<SimAws> {
  const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "FirewallAdminRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (policyStatement !== undefined) {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "FirewallAdminRole",
        PolicyName: "ManageWebAcls",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: policyStatement,
        }),
      }),
    );
  }

  return simAws;
}

/** The request options that make a call arrive as the Role. */
const asRole = {
  caller: {
    kind: "arn",
    arn: `arn:aws:iam::${accountIdOneOnes}:role/FirewallAdminRole`,
  },
} as const;

describe("WAFv2 IAM authorization", () => {
  it("allows a read of the web ACL a policy names", async () => {
    // Given a Role allowed to read one web ACL by name, with the generated id
    // left as a wildcard.
    const simAws = await simAwsWithRole({
      Action: "wafv2:GetWebACL",
      Resource: `arn:aws:wafv2:us-east-1:${accountIdOneOnes}:regional/webacl/api-acl/*`,
    });
    const waf = simAws.wafV2();
    const created = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "api-acl" }),
    );

    // When the Role reads it.
    const read = await waf.getWebAcl(
      new GetWebACLCommand({
        Name: "api-acl",
        Scope: "REGIONAL",
        Id: created.Id,
      }),
      asRole,
    );

    // Then it is allowed. A policy has to leave the id as a wildcard, since
    // WAFv2 generates it.
    assertIdentical(read.WebACL?.Name, "api-acl");
  });

  it("denies a read of a web ACL the policy does not name", async () => {
    // Given a Role allowed to read one web ACL.
    const simAws = await simAwsWithRole({
      Action: "wafv2:GetWebACL",
      Resource: `arn:aws:wafv2:us-east-1:${accountIdOneOnes}:regional/webacl/api-acl/*`,
    });
    const waf = simAws.wafV2();
    const created = await createSimWafWebAcl(
      waf,
      simWafCreateWebAclFactory.make({ Name: "site-acl" }),
    );

    // When it reads another.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.getWebAcl(
        new GetWebACLCommand({
          Name: "site-acl",
          Scope: "REGIONAL",
          Id: created.Id,
        }),
        asRole,
      );
    });

    // Then it is denied, naming the action and the resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "wafv2:GetWebACL");
    assertStringIncludes(error.message, "site-acl");
  });

  it("denies a caller with no policy at all", async () => {
    // Given a Role with nothing granted to it.
    const simAws = await simAwsWithRole();

    // When it creates a web ACL.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .wafV2()
        .createWebAcl({ input: simWafCreateWebAclFactory.make() }, asRole);
    });

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "wafv2:CreateWebACL");
  });

  it("denies a read before saying whether the web ACL is there", async () => {
    // Given a Role with nothing granted to it.
    const simAws = await simAwsWithRole();

    // When it reads a web ACL that does not exist.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.wafV2().getWebAcl(
        new GetWebACLCommand({
          Name: "missing",
          Scope: "REGIONAL",
          Id: "0f5a1b2c-3d4e-5f60-7182-93a4b5c6d7e8",
        }),
        asRole,
      );
    });

    // Then it is denied rather than told the web ACL is missing, so a caller
    // with no permission learns nothing about what is there.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows a listing only through a policy written against everything", async () => {
    // Given a Role allowed to list, granted on `*` as WAFv2 requires.
    const simAws = await simAwsWithRole({
      Action: "wafv2:ListWebACLs",
      Resource: "*",
    });
    const waf = simAws.wafV2();

    await createSimWafWebAcl(waf, simWafCreateWebAclFactory.make());

    // When it lists.
    const listed = await waf.listWebAcls(
      new ListWebACLsCommand({ Scope: "REGIONAL" }),
      asRole,
    );

    // Then the listing is allowed.
    assertArrayLength(listed.WebACLs ?? [], 1);
  });

  it("denies a listing granted only on web ACL ARNs", async () => {
    // Given a Role allowed to list, granted on every web ACL in the Account
    // and Region.
    const simAws = await simAwsWithRole({
      Action: "wafv2:ListWebACLs",
      Resource: `arn:aws:wafv2:us-east-1:${accountIdOneOnes}:regional/webacl/*`,
    });

    // When it lists.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .wafV2()
        .listWebAcls(new ListWebACLsCommand({ Scope: "REGIONAL" }), asRole);
    });

    // Then it is denied. ListWebACLs has no resource type on real WAFv2, so it
    // is evaluated against `*` and a policy scoped to ARNs allows none of it,
    // however broadly those ARNs are written.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
