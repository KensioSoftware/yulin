import {
  DeleteStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

/**
 * A template declaring an IP set and a regex pattern set side by side, with
 * the properties a test is about written over the ones both need.
 *
 * The two are deployed together because everything they do is the same bar the
 * one property each is made of, and a stack holding both says so.
 */
function setsTemplate(
  ipSet: Record<string, SimCfnTemplateValue> = {},
  patternSet: Record<string, SimCfnTemplateValue> = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OfficeAddresses: {
        Type: "AWS::WAFv2::IPSet",
        Properties: {
          Name: "office-addresses",
          Scope: "REGIONAL",
          IPAddressVersion: "IPV4",
          Addresses: ["192.0.2.0/24"],
          ...ipSet,
        },
      },
      BotPatterns: {
        Type: "AWS::WAFv2::RegexPatternSet",
        Properties: {
          Name: "bot-patterns",
          Scope: "REGIONAL",
          RegularExpressionList: ["^curl/", "^wget/"],
          ...patternSet,
        },
      },
    },
    Outputs: {
      IpSetRef: { Value: { Ref: "OfficeAddresses" } },
      IpSetArn: { Value: { "Fn::GetAtt": ["OfficeAddresses", "Arn"] } },
      IpSetId: { Value: { "Fn::GetAtt": ["OfficeAddresses", "Id"] } },
      PatternSetArn: { Value: { "Fn::GetAtt": ["BotPatterns", "Arn"] } },
      PatternSetId: { Value: { "Fn::GetAtt": ["BotPatterns", "Id"] } },
    },
  };
}

async function deploySets(
  simAws: SimAws,
  ipSet: Record<string, SimCfnTemplateValue> = {},
  patternSet: Record<string, SimCfnTemplateValue> = {},
): Promise<SimCfnStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "sets",
    template: setsTemplate(ipSet, patternSet),
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * One output of the deployed stack, which every assertion here reaches an ARN
 * through.
 */
function outputValue(stack: SimCfnStack, name: string): string {
  const value = stack.outputs.get(name)?.value;

  assertTypeString(value);

  return value;
}

/**
 * Deploy Resources that are expected to fail, and answer with the error.
 */
async function deploymentFailure(
  resources: Record<string, SimCfnTemplateValue>,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "sets",
      template: { Resources: resources },
    });
    await stack.waitForDeployComplete();
  });
}

describe("AWS::WAFv2::IPSet and AWS::WAFv2::RegexPatternSet", () => {
  it("deploys both sets with what the template wrote in them", async () => {
    // Given a template declaring an IP set and a regex pattern set.
    const simAws = new SimAws();
    const stack = await deploySets(simAws);
    const wafV2 = simAws.wafV2();

    // Then each is there under the ARN its attribute reported, holding what
    // the template gave it. A template writes the expressions as plain
    // strings, where the API wraps each in a RegexString.
    const ipSet = wafV2.findIpSetByArn(outputValue(stack, "IpSetArn"));
    const patternSet = wafV2.findRegexPatternSetByArn(
      outputValue(stack, "PatternSetArn"),
    );

    assertNonNullable(ipSet);
    assertNonNullable(patternSet);
    assertIdentical(ipSet.ipAddressVersion, "IPV4");
    assertArrayLength(ipSet.addresses, 1);
    assertIdentical(ipSet.addresses[0], "192.0.2.0/24");
    assertArrayLength(patternSet.regularExpressions, 2);
    assertIdentical(patternSet.regularExpressions[0], "^curl/");
  });

  it("answers Ref with the physical id and Id with the id alone", async () => {
    // Given a deployed IP set whose Ref and Id are both outputs.
    const simAws = new SimAws();
    const stack = await deploySets(simAws);
    const ipSet = simAws.wafV2().findIpSetByArn(outputValue(stack, "IpSetArn"));

    assertNonNullable(ipSet);

    // Then the Ref is the three-part physical id WAFv2 resources carry, and
    // the attribute is the generated id on its own.
    assertIdentical(
      stack.outputs.get("IpSetRef")?.value,
      `office-addresses|${ipSet.id}|REGIONAL`,
    );
    assertIdentical(stack.outputs.get("IpSetId")?.value, ipSet.id);
  });

  it("writes the new ranges and patterns over the sets on an update", async () => {
    // Given both sets deployed.
    const simAws = new SimAws();
    await deploySets(simAws);
    const cloudFormation = simAws.cloudFormation();

    // When the stack is updated with different contents.
    const updatedTemplate = setsTemplate(
      { Addresses: ["198.51.100.0/24"] },
      { RegularExpressionList: ["^scraper/"] },
    );

    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "sets",
        TemplateBody: jsonStringify(updatedTemplate),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("sets");

    // Then each holds what the new template said, and neither was left beside
    // a second set under the same name.
    const stack = cloudFormation.getStackByName("sets");
    assertNonNullable(stack);

    const wafV2 = simAws.wafV2();
    const ipSet = wafV2.findIpSetByArn(outputValue(stack, "IpSetArn"));
    const patternSet = wafV2.findRegexPatternSetByArn(
      outputValue(stack, "PatternSetArn"),
    );

    assertNonNullable(ipSet);
    assertNonNullable(patternSet);
    assertIdentical(ipSet.addresses[0], "198.51.100.0/24");
    assertIdentical(patternSet.regularExpressions[0], "^scraper/");
  });

  it("deletes both sets when the stack comes down", async () => {
    // Given both sets deployed.
    const simAws = new SimAws();
    const stack = await deploySets(simAws);
    const ipSetArn = outputValue(stack, "IpSetArn");
    const patternSetArn = outputValue(stack, "PatternSetArn");

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "sets" }));
    await simAws.backgroundTasksComplete();

    // Then neither set is there any more.
    const wafV2 = simAws.wafV2();

    assertUndefined(wafV2.findIpSetByArn(ipSetArn));
    assertUndefined(wafV2.findRegexPatternSetByArn(patternSetArn));
  });

  it("refuses an address a template wrote without a prefix length", async () => {
    // Given a template whose IP set holds a bare address, which WAF refuses:
    // it takes CIDR notation and nothing else.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deploySets(simAws, { Addresses: ["192.0.2.44"] });
    });

    // Then the deployment failed, naming the Resource that asked for it.
    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::IPSet Resource OfficeAddresses",
    );
    assertStringIncludes(error.message, "192.0.2.44");
  });

  it("refuses an expression that will not compile", async () => {
    // Given a template whose pattern set holds an unclosed group.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deploySets(simAws, {}, { RegularExpressionList: ["^(unclosed"] });
    });

    // Then the deployment failed where the expression was written, rather than
    // leaving a rule that would quietly match nothing.
    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::RegexPatternSet Resource BotPatterns",
    );
  });

  it("refuses a property whose template value is the wrong shape", async () => {
    // Given a template whose Addresses is a string.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deploySets(simAws, { Addresses: "192.0.2.0/24" });
    });

    // Then the refusal says which Resource could not be read.
    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::IPSet Resource OfficeAddresses: Addresses must be " +
        "a list",
    );
  });

  it("refuses a set whose required list the template left out", async () => {
    // Given a template that misspells Addresses, which real CloudFormation
    // refuses against the schema.
    const error = await deploymentFailure({
      OfficeAddresses: {
        Type: "AWS::WAFv2::IPSet",
        Properties: {
          Name: "office-addresses",
          Scope: "REGIONAL",
          IPAddressVersion: "IPV4",
          Address: ["192.0.2.0/24"],
        },
      },
    });

    // Then the deployment failed. Reading the omission as an empty list would
    // deploy a set holding nothing, and a rule pointing at one matches no
    // request at all.
    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::IPSet Resource OfficeAddresses: Addresses is " +
        "required",
    );
  });

  it("refuses a pattern set whose expressions the template left out", async () => {
    // Given a template whose pattern set names no expressions.
    const error = await deploymentFailure({
      BotPatterns: {
        Type: "AWS::WAFv2::RegexPatternSet",
        Properties: { Name: "bot-patterns", Scope: "REGIONAL" },
      },
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::RegexPatternSet Resource BotPatterns: " +
        "RegularExpressionList is required",
    );
  });

  it("refuses a RegularExpressionList that is not a list", async () => {
    // Given a template writing one expression as a bare string, which is a
    // mistake worth making: the list is of strings here where the API takes a
    // list of objects, so it reads as though a string would do.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deploySets(simAws, {}, { RegularExpressionList: "^curl/" });
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::RegexPatternSet Resource BotPatterns: " +
        "RegularExpressionList must be a list",
    );
  });
});
