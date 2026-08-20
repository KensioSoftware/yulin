import {
  DescribeManagedRuleGroupCommand,
  WAFV2Client,
} from "@aws-sdk/client-wafv2";
import {
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../../sdk/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimWafUnsimulatedInputException } from "../../error/sim-wafv2.error.js";

describe("SimWafV2 DescribeManagedRuleGroup", () => {
  it("reports the rules and labels of a simulated group", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When the known bad inputs group is described.
    const described = await waf.describeManagedRuleGroup({
      input: {
        VendorName: "AWS",
        Name: "AWSManagedRulesKnownBadInputsRuleSet",
        Scope: "REGIONAL",
      },
    });

    // Then it reports what a caller writing an override needs: the rules in
    // the order the group runs them, what each does, and the labels they add.
    assertArrayLength(described.Rules ?? [], 11);
    assertIdentical(
      described.Rules?.[0]?.Name,
      "JavaDeserializationRCE_HEADER",
    );
    assertIdentical(described.Capacity, 200);
    assertIdentical(
      described.LabelNamespace,
      "awswaf:managed:aws:known-bad-inputs:",
    );
    assertArrayIncludes(
      (described.AvailableLabels ?? []).map((label) => label.Name),
      "awswaf:managed:aws:known-bad-inputs:Log4JRCE_Body",
    );
  });

  it("refuses a group that is not simulated", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a group outside the three is described.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.describeManagedRuleGroup({
        input: {
          VendorName: "AWS",
          Name: "AWSManagedRulesSQLiRuleSet",
          Scope: "REGIONAL",
        },
      });
    });

    // Then it is refused by name, saying which groups are simulated.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "AWSManagedRulesSQLiRuleSet");
    assertStringIncludes(error.message, "AWSManagedRulesCommonRuleSet");
  });

  it("refuses a published version of a group", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a description names a version.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.describeManagedRuleGroup({
        input: {
          VendorName: "AWS",
          Name: "AWSManagedRulesCommonRuleSet",
          Scope: "REGIONAL",
          VersionName: "Version_1.9",
        },
      });
    });

    // Then it is refused rather than answered with rules that are not the ones
    // that version holds.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "VersionName");
  });

  it("answers an intercepted SDK client", async () => {
    // Given an intercepted WAFv2 SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(WAFV2Client);

    const client = new WAFV2Client({ region: "eu-west-2" });

    // When ordinary SDK code describes the core rule set.
    const described = await client.send(
      new DescribeManagedRuleGroupCommand({
        VendorName: "AWS",
        Name: "AWSManagedRulesCommonRuleSet",
        Scope: "REGIONAL",
      }),
    );

    // Then it was answered by the simulator, with nothing touching the
    // network.
    assertArrayLength(described.Rules ?? [], 22);
  });
});
