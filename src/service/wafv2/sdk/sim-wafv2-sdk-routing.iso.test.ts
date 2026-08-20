import {
  AssociateWebACLCommand,
  CreateIPSetCommand,
  CreateRegexPatternSetCommand,
  CreateWebACLCommand,
  DeleteIPSetCommand,
  DeleteRegexPatternSetCommand,
  DeleteWebACLCommand,
  GetIPSetCommand,
  GetRegexPatternSetCommand,
  GetWebACLCommand,
  ListIPSetsCommand,
  ListRegexPatternSetsCommand,
  ListWebACLsCommand,
  UpdateWebACLCommand,
  WAFV2Client,
} from "@aws-sdk/client-wafv2";
import {
  assertArrayIncludesAll,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk, SimSdkUnsupportedCommandError } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * A web ACL as ordinary SDK code writes one.
 *
 * This is written out rather than built from the test factory because the SDK
 * Command types are stricter than the shapes simulated WAFv2 accepts, which is
 * the point of interception: what goes in is what an application sends.
 */
const apiAclInput = {
  Name: "api-acl",
  Scope: "REGIONAL",
  DefaultAction: { Allow: {} },
  VisibilityConfig: {
    SampledRequestsEnabled: false,
    CloudWatchMetricsEnabled: false,
    MetricName: "api",
  },
} as const;

describe("SimWafSdkCommandRouter", () => {
  it("names every Command simulated WAFv2 handles", () => {
    // Given a scoped simulated WAFv2.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws.wafV2().sdkCommandRouter().supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateWebACLCommand",
      "GetWebACLCommand",
      "UpdateWebACLCommand",
      "ListWebACLsCommand",
      "DeleteWebACLCommand",
      "CreateIPSetCommand",
      "GetIPSetCommand",
      "ListIPSetsCommand",
      "DeleteIPSetCommand",
      "CreateRegexPatternSetCommand",
      "GetRegexPatternSetCommand",
      "ListRegexPatternSetsCommand",
      "DeleteRegexPatternSetCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated WAFv2.
    const simAws = new SimAws();

    // When a WAFv2 Command outside what is simulated is looked up.
    const route = simAws
      .wafV2()
      .sdkCommandRouter()
      .route("AssociateWebACLCommand");

    // Then there is no route for it. Association follows in its own issues.
    assertUndefined(route);
  });
});

describe("WAFv2 SDK interception", () => {
  it("routes an intercepted WAFV2Client to simulated WAFv2", async () => {
    // Given an intercepted WAFv2 SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(WAFV2Client);

    const client = new WAFV2Client({ region: "eu-west-2" });
    const scoped = simSdk.simAws.accountRegionScope(
      simSdk.simAws.defaultAccountId,
      "eu-west-2",
    );

    // When ordinary SDK code creates a web ACL.
    const created = await client.send(new CreateWebACLCommand(apiAclInput));

    // Then it reached the simulated WAFv2 for the Region the client was
    // configured for, with nothing touching the network.
    const [webAcl] = scoped.wafV2().allWebAcls("REGIONAL");

    assertNonNullable(webAcl);
    assertIdentical(webAcl.name, "api-acl");
    assertIdentical(webAcl.arn, created.Summary?.ARN);
  });

  it("routes every remaining Command through the intercepted client", async () => {
    // Given an intercepted client.
    using simSdk = new SimSdk();
    simSdk.intercept(WAFV2Client);

    const client = new WAFV2Client({ region: "eu-west-2" });

    // When each of the remaining operations is used.
    const created = await client.send(new CreateWebACLCommand(apiAclInput));
    const read = await client.send(
      new GetWebACLCommand({
        Name: "api-acl",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );
    const updated = await client.send(
      new UpdateWebACLCommand({
        ...apiAclInput,
        Id: created.Summary?.Id,
        LockToken: read.LockToken,
        Description: "the public API",
      }),
    );
    const listedAcls = await client.send(
      new ListWebACLsCommand({ Scope: "REGIONAL" }),
    );

    const ipSet = await client.send(
      new CreateIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        IPAddressVersion: "IPV4",
        Addresses: ["192.0.2.0/24"],
      }),
    );
    const readIpSet = await client.send(
      new GetIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        Id: ipSet.Summary?.Id,
      }),
    );
    const listedIpSets = await client.send(
      new ListIPSetsCommand({ Scope: "REGIONAL" }),
    );

    const patternSet = await client.send(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [{ RegexString: "sqlmap" }],
      }),
    );
    const readPatternSet = await client.send(
      new GetRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        Id: patternSet.Summary?.Id,
      }),
    );
    const listedPatternSets = await client.send(
      new ListRegexPatternSetsCommand({ Scope: "REGIONAL" }),
    );

    await client.send(
      new DeleteIPSetCommand({
        Name: "office",
        Scope: "REGIONAL",
        Id: ipSet.Summary?.Id,
        LockToken: readIpSet.LockToken,
      }),
    );
    await client.send(
      new DeleteRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        Id: patternSet.Summary?.Id,
        LockToken: readPatternSet.LockToken,
      }),
    );
    await client.send(
      new DeleteWebACLCommand({
        Name: "api-acl",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
        LockToken: updated.NextLockToken,
      }),
    );
    const afterDelete = await client.send(
      new ListWebACLsCommand({ Scope: "REGIONAL" }),
    );

    // Then each one reached simulated WAFv2.
    assertIdentical(read.WebACL?.Name, "api-acl");
    assertArrayLength(listedAcls.WebACLs ?? [], 1);
    assertIdentical(readIpSet.IPSet?.Addresses?.[0], "192.0.2.0/24");
    assertArrayLength(listedIpSets.IPSets ?? [], 1);
    assertIdentical(
      readPatternSet.RegexPatternSet?.RegularExpressionList?.[0]?.RegexString,
      "sqlmap",
    );
    assertArrayLength(listedPatternSets.RegexPatternSets ?? [], 1);
    assertArrayLength(afterDelete.WebACLs ?? [], 0);
  });

  it("refuses a Command simulated WAFv2 does not handle", async () => {
    // Given an intercepted client.
    using simSdk = new SimSdk();
    simSdk.intercept(WAFV2Client);

    const client = new WAFV2Client({ region: "eu-west-2" });

    // When it associates a web ACL with something.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new AssociateWebACLCommand({
          WebACLArn: "arn:aws:wafv2:eu-west-2:111111111111:regional/webacl/x/y",
          ResourceArn: "arn:aws:elasticloadbalancing:eu-west-2:111111111111:x",
        }),
      );
    });

    // Then it is refused by name rather than reaching real AWS.
    assertInstanceOf(error, SimSdkUnsupportedCommandError);
    assertStringIncludes(error.message, "AssociateWebACLCommand");
  });
});
