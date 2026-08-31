import { DeleteStackCommand } from "@aws-sdk/client-cloudformation";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

interface DeployedConfigurationSet {
  readonly simAws: SimAws;
  readonly stack: SimCfnDeployedStack;
}

async function deployConfigurationSet(
  properties: SimCfnTemplateValueRecord,
): Promise<DeployedConfigurationSet> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        Transactional: {
          Type: "AWS::SES::ConfigurationSet",
          Properties: properties,
        },
      },
      Outputs: { Name: { Value: { Ref: "Transactional" } } },
    },
  });

  return { simAws, stack };
}

/** Deploy a set whose stack reads one attribute off it. */
async function deployWithAttribute(attributeName: string): Promise<void> {
  await new SimAws().cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        Transactional: {
          Type: "AWS::SES::ConfigurationSet",
          Properties: { Name: "transactional" },
        },
      },
      Outputs: {
        Read: { Value: { "Fn::GetAtt": ["Transactional", attributeName] } },
      },
    },
  });
}

describe("AWS::SES::ConfigurationSet", () => {
  it("deploys a set a template declares, with its options", async () => {
    // Given a template declaring a set that suppresses both reasons and has
    // sending turned off.
    const { simAws, stack } = await deployConfigurationSet({
      Name: "transactional",
      SuppressionOptions: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] },
      SendingOptions: { SendingEnabled: false },
      DeliveryOptions: {
        TlsPolicy: "REQUIRE",
        SendingPoolName: "shared",
        MaxDeliverySeconds: 300,
      },
      ReputationOptions: { ReputationMetricsEnabled: true },
    });

    // Then the set is simulated state a test can read back, rather than a
    // Resource the stack stepped over.
    const configurationSet = simAws
      .sesV2()
      .findConfigurationSet("transactional");

    assertArrayEmpty(stack.skippedResources);
    assertNonNullable(configurationSet);
    assertNonNullable(configurationSet.suppressedReasons);
    assertArrayEquals(configurationSet.suppressedReasons, [
      "BOUNCE",
      "COMPLAINT",
    ]);
    assertFalse(configurationSet.sendingEnabled);
    assertIdentical(configurationSet.deliveryOptions.tlsPolicy, "REQUIRE");
    assertIdentical(configurationSet.deliveryOptions.maxDeliverySeconds, 300);
    assertTrue(configurationSet.reputationOptions.reputationMetricsEnabled);
  });

  it("answers a Ref with the set's name", async () => {
    // Given a deployed set whose Ref is an output.
    const { stack } = await deployConfigurationSet({ Name: "transactional" });

    // Then the Ref is the name, which is directly usable as the
    // ConfigurationSetName of a send.
    assertIdentical(stack.outputs.get("Name")?.value, "transactional");
  });

  it("refuses the Id attribute, which this Resource type lacks", async () => {
    // Given a template reading an Id off the set, which AWS::SES::Template has
    // and this Resource type does not.
    const error = await assertThrowsErrorAsync(async () => {
      await deployWithAttribute("Id");
    });

    // Then the deploy fails. Answering it would let a template deploy here and
    // fail on AWS.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::SES::ConfigurationSet attribute Id",
    );
  });

  it("names an unnamed set after the stack and the logical ID", async () => {
    // Given a template declaring a set with no Name, which CloudFormation
    // allows.
    const { simAws, stack } = await deployConfigurationSet({});

    // Then a name was generated, and it is what the Ref answers.
    const generated = stack.outputs.get("Name")?.value;

    assertTypeString(generated);
    assertStringIncludes(generated, "orders");
    assertNonNullable(simAws.sesV2().findConfigurationSet(generated));
  });

  it("deploys with tracking and VDM options, recording them as ignored", async () => {
    // Given a template setting the two groups this simulation has nothing to
    // act on.
    const { simAws, stack } = await deployConfigurationSet({
      Name: "transactional",
      TrackingOptions: { CustomRedirectDomain: "click.example.com" },
      VdmOptions: { DashboardOptions: { EngagementMetrics: "ENABLED" } },
    });

    // Then the set deployed, and each property it was deployed without acting
    // on is recorded rather than passed over in silence. The SDK path refuses
    // both, and a template is a whole document one property should not sink.
    assertNonNullable(simAws.sesV2().findConfigurationSet("transactional"));

    const ignored = stack.ignoredProperties.map((property) => property.path);

    assertArrayEquals(ignored, ["TrackingOptions", "VdmOptions"]);
    assertStringIncludes(
      stack.ignoredProperties.map((property) => property.reason).join("\n"),
      "open and click tracking is not simulated",
    );
  });

  it("removes the set when the stack is deleted", async () => {
    // Given a deployed set.
    const { simAws } = await deployConfigurationSet({ Name: "transactional" });

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "orders" }));
    await simAws.backgroundTasksComplete();

    // Then the set went with it.
    assertArrayEmpty(simAws.sesV2().allConfigurationSets());
  });

  it("refuses a suppression reason SES has no meaning for", async () => {
    // Given a template naming a reason that is neither a bounce nor a
    // complaint.
    const error = await assertThrowsErrorAsync(async () => {
      await deployConfigurationSet({
        Name: "transactional",
        SuppressionOptions: { SuppressedReasons: ["UNSUBSCRIBE"] },
      });
    });

    // Then the deploy fails, naming the Resource that asked. The set goes
    // through the ordinary command, so a template and an SDK caller are
    // validated in one place.
    assertStringIncludes(error.message, "AWS::SES::ConfigurationSet");
    assertStringIncludes(error.message, "Transactional");
    assertStringIncludes(error.message, "BOUNCE, COMPLAINT");
  });

  it("refuses any other attribute too", async () => {
    const error = await assertThrowsErrorAsync(async () => {
      await deployWithAttribute("Arn");
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::SES::ConfigurationSet attribute Arn",
    );
  });
});

describe("AWS::SES::ConfigurationSet property types", () => {
  it("reads a boolean CloudFormation carried as a string", async () => {
    // Given a template whose switches came through as strings, which is what
    // a String Parameter or an Fn::Sub leaves behind.
    const { simAws } = await deployConfigurationSet({
      Name: "transactional",
      SendingOptions: { SendingEnabled: "false" },
      ReputationOptions: { ReputationMetricsEnabled: "true" },
    });

    // Then each is the boolean it stands for. Storing the string would read
    // back as configured and mean the opposite of what it says.
    const configurationSet = simAws
      .sesV2()
      .findConfigurationSet("transactional");

    assertNonNullable(configurationSet);
    assertFalse(configurationSet.sendingEnabled);
    assertTrue(configurationSet.reputationOptions.reputationMetricsEnabled);
  });

  it("reads a number CloudFormation carried as a string", async () => {
    const { simAws } = await deployConfigurationSet({
      Name: "transactional",
      DeliveryOptions: { MaxDeliverySeconds: "300" },
    });

    assertIdentical(
      simAws.sesV2().findConfigurationSet("transactional")?.deliveryOptions
        .maxDeliverySeconds,
      300,
    );
  });

  it("reads an option group that declares none of its members", async () => {
    // Given a template carrying two empty groups, which say nothing about
    // which reasons to suppress or how to deliver.
    const { simAws } = await deployConfigurationSet({
      Name: "transactional",
      SuppressionOptions: {},
      DeliveryOptions: {},
    });

    // Then the empty suppression group remains an explicit override, while
    // the empty delivery group uses the real SES defaults.
    const configurationSet = simAws
      .sesV2()
      .findConfigurationSet("transactional");

    assertNonNullable(configurationSet);
    assertNonNullable(configurationSet.suppressedReasons);
    assertArrayEmpty(configurationSet.suppressedReasons);
    assertIdentical(configurationSet.deliveryOptions.tlsPolicy, "OPTIONAL");
    assertUndefined(configurationSet.deliveryOptions.maxDeliverySeconds);
  });

  it.each([
    {
      described: "a group that is not an object",
      properties: { SendingOptions: "enabled" },
      message: "SendingOptions must be an object",
    },
    {
      described: "a switch that is neither boolean nor true or false",
      properties: { SendingOptions: { SendingEnabled: 3 } },
      message: "SendingOptions.SendingEnabled must be a boolean",
    },
    {
      described: "a delivery deadline that is not a number",
      properties: { DeliveryOptions: { MaxDeliverySeconds: "soon" } },
      message: "DeliveryOptions.MaxDeliverySeconds must be a number",
    },
    {
      described: "a delivery deadline left blank",
      properties: { DeliveryOptions: { MaxDeliverySeconds: "" } },
      message: "DeliveryOptions.MaxDeliverySeconds must be a number",
    },
    {
      described: "a delivery deadline of nothing but spaces",
      properties: { DeliveryOptions: { MaxDeliverySeconds: " ".repeat(3) } },
      message: "DeliveryOptions.MaxDeliverySeconds must be a number",
    },
    {
      described: "a TLS policy that is not a string",
      properties: { DeliveryOptions: { TlsPolicy: true } },
      message: "DeliveryOptions.TlsPolicy must be a string",
    },
    {
      described: "a sending pool that is not a string",
      properties: { DeliveryOptions: { SendingPoolName: 7 } },
      message: "DeliveryOptions.SendingPoolName must be a string",
    },
    {
      described: "suppressed reasons that are not a list",
      properties: { SuppressionOptions: { SuppressedReasons: "BOUNCE" } },
      message: "SuppressionOptions.SuppressedReasons must be a list",
    },
    {
      described: "a suppressed reason that is not a string",
      properties: { SuppressionOptions: { SuppressedReasons: [1] } },
      message: "SuppressionOptions.SuppressedReasons must be a list of strings",
    },
    {
      described: "a name that is not a string",
      properties: { Name: 42 },
      message: "Name must be a string",
    },
  ])("refuses $described", async ({ properties, message }) => {
    // Given a template whose property is a type CloudFormation would refuse.
    const error = await assertThrowsErrorAsync(async () => {
      await deployConfigurationSet({ Name: "transactional", ...properties });
    });

    // Then the deploy fails saying which property and what was wanted.
    assertStringIncludes(error.message, message);
  });
});
