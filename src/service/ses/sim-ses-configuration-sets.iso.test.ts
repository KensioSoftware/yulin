import {
  CreateConfigurationSetCommand,
  DeleteConfigurationSetCommand,
  GetConfigurationSetCommand,
  ListConfigurationSetsCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

/** A simulated SES with one fully declared configuration set in it. */
async function sesWithTransactionalSet(): Promise<SimSesV2> {
  const ses = new SimAws().sesV2();

  await ses.createConfigurationSet(
    new CreateConfigurationSetCommand({
      ConfigurationSetName: "transactional",
      SuppressionOptions: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] },
      SendingOptions: { SendingEnabled: false },
      DeliveryOptions: { TlsPolicy: "REQUIRE", SendingPoolName: "shared" },
      ReputationOptions: { ReputationMetricsEnabled: true },
    }),
  );

  return ses;
}

describe("simulated SES configuration sets", () => {
  it("holds what a set was created with", async () => {
    // Given a configuration set declaring every group of options.
    const ses = await sesWithTransactionalSet();

    // When the simulator is asked for it.
    const configurationSet = ses.findConfigurationSet("transactional");

    // Then each group is there to assert on, which is the whole point of
    // holding a set that nothing here routes an event to.
    assertNonNullable(configurationSet);
    assertArrayEquals(configurationSet.suppressedReasons, [
      "BOUNCE",
      "COMPLAINT",
    ]);
    assertFalse(configurationSet.sendingEnabled);
    assertIdentical(configurationSet.deliveryOptions.tlsPolicy, "REQUIRE");
    assertIdentical(configurationSet.deliveryOptions.sendingPoolName, "shared");
    assertTrue(configurationSet.reputationOptions.reputationMetricsEnabled);
  });

  it("applies the defaults real SES applies to a bare set", async () => {
    // Given a set declaring nothing but its name.
    const ses = new SimAws().sesV2();

    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({ ConfigurationSetName: "bare" }),
    );

    // Then sending is on, TLS is optional, reputation metrics are off and no
    // reason is suppressed, which is what a real set defaults to.
    const configurationSet = ses.findConfigurationSet("bare");

    assertNonNullable(configurationSet);
    assertTrue(configurationSet.sendingEnabled);
    assertIdentical(configurationSet.deliveryOptions.tlsPolicy, "OPTIONAL");
    assertFalse(configurationSet.reputationOptions.reputationMetricsEnabled);
    assertArrayLength(configurationSet.suppressedReasons, 0);
    assertUndefined(configurationSet.deliveryOptions.sendingPoolName);
  });

  it("reports every option group back from GetConfigurationSet", async () => {
    // Given a fully declared set.
    const ses = await sesWithTransactionalSet();

    // When it is read through the API.
    const read = await ses.getConfigurationSet(
      new GetConfigurationSetCommand({ ConfigurationSetName: "transactional" }),
    );

    assertIdentical(read.ConfigurationSetName, "transactional");
    assertArrayEquals(read.SuppressionOptions?.SuppressedReasons ?? [], [
      "BOUNCE",
      "COMPLAINT",
    ]);
    assertFalse(read.SendingOptions?.SendingEnabled);
    assertIdentical(read.DeliveryOptions?.TlsPolicy, "REQUIRE");
    assertTrue(read.ReputationOptions?.ReputationMetricsEnabled);
  });

  it("answers the defaults it applied rather than leaving them out", async () => {
    // Given a set declaring nothing but its name.
    const ses = new SimAws().sesV2();

    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({ ConfigurationSetName: "bare" }),
    );

    // When it is read through the API.
    const read = await ses.getConfigurationSet(
      new GetConfigurationSetCommand({ ConfigurationSetName: "bare" }),
    );

    // Then the groups the set never declared are still reported, as real SES
    // reports them.
    assertTrue(read.SendingOptions?.SendingEnabled);
    assertIdentical(read.DeliveryOptions?.TlsPolicy, "OPTIONAL");
  });

  it("lists the sets by name, in the order they were made", async () => {
    // Given two sets.
    const ses = await sesWithTransactionalSet();

    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({ ConfigurationSetName: "marketing" }),
    );

    // When they are listed.
    const listed = await ses.listConfigurationSets(
      new ListConfigurationSetsCommand({}),
    );

    // Then names alone come back. Real SES lists no settings here, so a caller
    // after them reads one set at a time.
    assertArrayEquals(listed.ConfigurationSets ?? [], [
      "transactional",
      "marketing",
    ]);
  });

  it("pages a listing and reaches the rest with the token", async () => {
    // Given two sets and a page that holds one.
    const ses = await sesWithTransactionalSet();

    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({ ConfigurationSetName: "marketing" }),
    );

    const first = await ses.listConfigurationSets(
      new ListConfigurationSetsCommand({ PageSize: 1 }),
    );
    const second = await ses.listConfigurationSets(
      new ListConfigurationSetsCommand({
        PageSize: 1,
        NextToken: first.NextToken,
      }),
    );

    assertArrayEquals(first.ConfigurationSets ?? [], ["transactional"]);
    assertArrayEquals(second.ConfigurationSets ?? [], ["marketing"]);
    assertUndefined(second.NextToken);
  });

  it("removes a set that is deleted", async () => {
    // Given a set.
    const ses = await sesWithTransactionalSet();

    // When it is deleted.
    await ses.deleteConfigurationSet(
      new DeleteConfigurationSetCommand({
        ConfigurationSetName: "transactional",
      }),
    );

    // Then nothing is left holding the name.
    assertUndefined(ses.findConfigurationSet("transactional"));
    assertArrayLength(ses.allConfigurationSets(), 0);
  });

  it("keeps a set in one Region out of another", async () => {
    // Given a set made in one Region.
    const simAws = new SimAws();

    await simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .sesV2()
      .createConfigurationSet(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: "transactional",
        }),
      );

    // Then another Region has none, as a real account would not.
    assertUndefined(
      simAws
        .accountRegionScope(simAws.defaultAccountId, "us-east-1")
        .sesV2()
        .findConfigurationSet("transactional"),
    );
  });
});
