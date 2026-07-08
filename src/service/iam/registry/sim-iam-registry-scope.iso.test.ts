import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { AwsRegion } from "../../aws/sim-aws-region.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Sim IAM registry scoping", () => {
  it("reuses the same IAM service facade across regions in one account", () => {
    // Given a top-level simulated AWS instance with one account.
    const simAws = new SimAws();
    const account = simAws.account("111111111111");

    // When IAM is requested from two different regions in that account.
    const euWestIam = account.region(AwsRegion.EuWest1).iam();
    const usEastIam = account.region(AwsRegion.UsEast1).iam();

    // Then IAM is account-scoped and the same facade is reused across regions.
    assertIdentical(euWestIam, usEastIam);
  });

  it("uses separate IAM service facades for separate accounts", () => {
    // Given a top-level simulated AWS instance with two accounts.
    const simAws = new SimAws();

    // When IAM is requested from each account.
    const firstAccountIam = simAws.account("111111111111").iam();
    const secondAccountIam = simAws.account("222222222222").iam();

    // Then each account gets its own IAM facade.
    assertFalse(firstAccountIam === secondAccountIam);
  });

  it("shares IAM activation state across accounts and regions in one SimAws instance", async () => {
    // Given IAM service facades from different accounts and regions.
    const simAws = new SimAws();
    const firstAccountIam = simAws
      .account("111111111111")
      .region(AwsRegion.EuWest1)
      .iam();
    const secondAccountIam = simAws
      .account("222222222222")
      .region(AwsRegion.UsEast1)
      .iam();

    // When an IAM API call activates IAM from one account and region.
    await firstAccountIam.listPolicies({ input: {} });

    // Then the top-level IAM registry is activated sim-wide.
    assertTrue(simAws.iamRegistry.isActivated);
    assertFalse(simAws.iamRegistry.isDisabled);
    const activationEvents = simAws.iamRegistry.activationEvents;
    assertArrayLength(activationEvents, 1);
    assertIdentical(activationEvents[0].reason, "IAM SDK API");
    assertIdentical(activationEvents[0].detail, "ListPolicies");

    // When another IAM API call is made from a different account and region.
    await secondAccountIam.listPolicies({ input: {} });

    // Then the same sim-wide registry records the second activation attempt.
    assertTrue(simAws.iamRegistry.isActivated);
    assertArrayLength(simAws.iamRegistry.activationEvents, 2);
    assertIdentical(
      simAws.iamRegistry.activationEvents[1].reason,
      "IAM SDK API",
    );
    assertIdentical(
      simAws.iamRegistry.activationEvents[1].detail,
      "ListPolicies",
    );
    assertTrue(simAws.iamRegistry.activationEvents[0].activated);
    assertTrue(simAws.iamRegistry.activationEvents[1].activated);
  });

  it("keeps permanent disable state across accounts and regions in one SimAws instance", async () => {
    // Given a top-level simulated AWS instance with sim IAM permanently disabled.
    const simAws = new SimAws();
    simAws.iamRegistry.disable("Test setup", "Disable sim IAM for this SimAws");

    // When an IAM API call attempts activation from a scoped IAM facade.
    await simAws
      .account("111111111111")
      .region(AwsRegion.EuWest1)
      .iam()
      .listPolicies({ input: {} });

    // Then the top-level registry stays permanently disabled but records the attempt.
    assertFalse(simAws.iamRegistry.isActivated);
    assertTrue(simAws.iamRegistry.isDisabled);
    const initialActivationEvents = simAws.iamRegistry.activationEvents;
    assertArrayLength(initialActivationEvents, 1);
    assertFalse(initialActivationEvents[0].activated);
    assertTrue(initialActivationEvents[0].registryDisabled);
    assertIdentical(
      initialActivationEvents[0].ignoredReason,
      "Sim IAM was permanently disabled by explicit user action.",
    );

    // When another account and region also attempts activation.
    await simAws
      .account("222222222222")
      .region(AwsRegion.UsEast1)
      .iam()
      .listPolicies({ input: {} });

    // Then disable remains sim-wide and diagnostics include both ignored attempts.
    assertFalse(simAws.iamRegistry.isActivated);
    assertTrue(simAws.iamRegistry.isDisabled);
    const subsequentActivationEvents = simAws.iamRegistry.activationEvents;
    assertArrayLength(subsequentActivationEvents, 2);
    assertFalse(subsequentActivationEvents[1].activated);
    assertTrue(subsequentActivationEvents[1].registryDisabled);
    assertIdentical(
      simAws.iamRegistry.statusReason,
      "Sim IAM is permanently disabled: Test setup (Disable sim IAM for this SimAws)",
    );
  });

  it("keeps IAM registry state isolated between separate SimAws instances", async () => {
    // Given two independent top-level simulated AWS instances.
    const firstSimAws = new SimAws();
    const secondSimAws = new SimAws();

    // When IAM is activated in the first instance and disabled in the second.
    await firstSimAws.iam().listPolicies({ input: {} });
    secondSimAws.iamRegistry.disable("Independent disable");

    // Then each SimAws instance keeps independent IAM registry state.
    assertTrue(firstSimAws.iamRegistry.isActivated);
    assertFalse(firstSimAws.iamRegistry.isDisabled);
    assertArrayLength(firstSimAws.iamRegistry.activationEvents, 1);
    assertFalse(secondSimAws.iamRegistry.isActivated);
    assertTrue(secondSimAws.iamRegistry.isDisabled);
    assertArrayLength(secondSimAws.iamRegistry.activationEvents, 0);
  });
});
