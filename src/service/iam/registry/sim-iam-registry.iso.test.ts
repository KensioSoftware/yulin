import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamRegistry } from "./sim-iam-registry.js";

describe("SimIamRegistry", () => {
  it("starts not activated and not disabled", () => {
    // Given a new sim IAM registry.
    const registry = new SimIamRegistry();

    // When its initial state is inspected.
    const activationEvents = registry.activationEvents;

    // Then it reports the default unactivated state.
    assertFalse(registry.isActivated);
    assertFalse(registry.isDisabled);
    assertArrayLength(activationEvents, 0);
    assertUndefined(registry.disableEvent);
    assertIdentical(
      registry.statusReason,
      "Sim IAM is not activated because it has not been activated.",
    );
  });

  it("activates with the default activation reason", () => {
    // Given a new sim IAM registry.
    const registry = new SimIamRegistry();

    // When sim IAM is manually activated without an explicit reason.
    registry.activate();

    // Then it becomes activated and records the default activation event.
    assertTrue(registry.isActivated);
    assertFalse(registry.isDisabled);
    assertArrayLength(registry.activationEvents, 1);
    assertIdentical(registry.activationEvents[0].reason, "Manual activation");
    assertUndefined(registry.activationEvents[0].detail);
    assertInstanceOf(registry.activationEvents[0].activatedAt, Date);
    assertTrue(registry.activationEvents[0].activated);
    assertFalse(registry.activationEvents[0].registryDisabled);
    assertUndefined(registry.activationEvents[0].ignoredReason);
    assertIdentical(
      registry.statusReason,
      "Sim IAM is activated: Manual activation",
    );
  });

  it("activates with a diagnostic reason and detail", () => {
    // Given a new sim IAM registry.
    const registry = new SimIamRegistry();

    // When sim IAM is activated with a reason and detail.
    registry.activate("IAM SDK API", "CreatePolicy");

    // Then it records the diagnostic activation information.
    assertTrue(registry.isActivated);
    assertArrayLength(registry.activationEvents, 1);
    assertIdentical(registry.activationEvents[0].reason, "IAM SDK API");
    assertIdentical(registry.activationEvents[0].detail, "CreatePolicy");
    assertTrue(registry.activationEvents[0].activated);
    assertFalse(registry.activationEvents[0].registryDisabled);
    assertIdentical(
      registry.statusReason,
      "Sim IAM is activated: IAM SDK API (CreatePolicy)",
    );
  });

  it("keeps activation idempotent while recording every activation attempt", () => {
    // Given an already activated sim IAM registry.
    const registry = new SimIamRegistry();
    registry.activate("IAM SDK API", "CreatePolicy");

    // When activation is attempted again.
    registry.activate("IAM SDK API", "ListPolicies");

    // Then it stays activated and records both successful activation attempts.
    assertTrue(registry.isActivated);
    assertFalse(registry.isDisabled);
    assertArrayLength(registry.activationEvents, 2);
    assertIdentical(registry.activationEvents[0].detail, "CreatePolicy");
    assertIdentical(registry.activationEvents[1].detail, "ListPolicies");
    assertTrue(registry.activationEvents[0].activated);
    assertTrue(registry.activationEvents[1].activated);
    assertFalse(registry.activationEvents[0].registryDisabled);
    assertFalse(registry.activationEvents[1].registryDisabled);
    assertIdentical(
      registry.statusReason,
      "Sim IAM is activated: IAM SDK API (ListPolicies)",
    );
  });

  it("disables with the default disable reason", () => {
    // Given an activated sim IAM registry.
    const registry = new SimIamRegistry();
    registry.activate();

    // When sim IAM is manually disabled without an explicit reason.
    registry.disable();

    // Then it becomes permanently disabled and records the default disable event.
    assertFalse(registry.isActivated);
    assertTrue(registry.isDisabled);
    assertIdentical(registry.disableEvent?.reason, "Manual disable");
    assertUndefined(registry.disableEvent.detail);
    assertInstanceOf(registry.disableEvent.disabledAt, Date);
    assertIdentical(
      registry.statusReason,
      "Sim IAM is permanently disabled: Manual disable",
    );
  });

  it("disables with a diagnostic reason and detail", () => {
    // Given an activated sim IAM registry.
    const registry = new SimIamRegistry();
    registry.activate("IAM SDK API", "CreatePolicy");

    // When sim IAM is disabled with a reason and detail.
    registry.disable("Test setup", "Opt out of IAM semantics");

    // Then it records the diagnostic disable information.
    assertFalse(registry.isActivated);
    assertTrue(registry.isDisabled);
    assertIdentical(registry.disableEvent?.reason, "Test setup");
    assertIdentical(registry.disableEvent.detail, "Opt out of IAM semantics");
    assertInstanceOf(registry.disableEvent.disabledAt, Date);
    assertIdentical(
      registry.statusReason,
      "Sim IAM is permanently disabled: Test setup (Opt out of IAM semantics)",
    );
  });

  it("keeps disable permanent and idempotent", () => {
    // Given a permanently disabled sim IAM registry.
    const registry = new SimIamRegistry();
    registry.disable("First disable", "Original reason");
    const firstDisableEvent = registry.disableEvent;
    assertNonNullable(firstDisableEvent);

    // When disable is attempted again with a different reason.
    registry.disable("Second disable", "Replacement reason");

    // Then it stays disabled and preserves the original permanent disable event.
    assertFalse(registry.isActivated);
    assertTrue(registry.isDisabled);
    assertIdentical(registry.disableEvent, firstDisableEvent);
    assertIdentical(registry.disableEvent.reason, "First disable");
    assertIdentical(registry.disableEvent.detail, "Original reason");
    assertIdentical(
      registry.statusReason,
      "Sim IAM is permanently disabled: First disable (Original reason)",
    );
  });

  it("records activation attempts after permanent disable without reactivating", () => {
    // Given a sim IAM registry that has been permanently disabled.
    const registry = new SimIamRegistry();
    registry.disable("Manual disable", "Test opt-out");

    // When activation is attempted after disable.
    registry.activate("IAM SDK API", "CreatePolicy");

    // Then the activation attempt is recorded but IAM remains permanently disabled.
    assertFalse(registry.isActivated);
    assertTrue(registry.isDisabled);
    assertArrayLength(registry.activationEvents, 1);
    assertIdentical(registry.activationEvents[0].reason, "IAM SDK API");
    assertIdentical(registry.activationEvents[0].detail, "CreatePolicy");
    assertInstanceOf(registry.activationEvents[0].activatedAt, Date);
    assertFalse(registry.activationEvents[0].activated);
    assertTrue(registry.activationEvents[0].registryDisabled);
    assertIdentical(
      registry.activationEvents[0].ignoredReason,
      "Sim IAM was permanently disabled by explicit user action.",
    );
    assertIdentical(
      registry.statusReason,
      "Sim IAM is permanently disabled: Manual disable (Test opt-out)",
    );
  });

  it("preserves activation history when disabled", () => {
    // Given a sim IAM registry with activation history.
    const registry = new SimIamRegistry();
    registry.activate("IAM SDK API", "CreatePolicy");
    registry.activate("IAM SDK API", "ListPolicies");

    // When sim IAM is permanently disabled.
    registry.disable("Manual disable");

    // Then the previous activation history remains available for diagnostics.
    assertFalse(registry.isActivated);
    assertTrue(registry.isDisabled);
    assertArrayLength(registry.activationEvents, 2);
    assertIdentical(registry.activationEvents[0].detail, "CreatePolicy");
    assertIdentical(registry.activationEvents[1].detail, "ListPolicies");
    assertTrue(registry.activationEvents[0].activated);
    assertTrue(registry.activationEvents[1].activated);
  });

  it("records both successful and ignored activation attempts in order", () => {
    // Given a sim IAM registry that is activated and then permanently disabled.
    const registry = new SimIamRegistry();
    registry.activate("IAM SDK API", "CreatePolicy");
    registry.disable("Manual disable");

    // When activation is attempted after permanent disable.
    registry.activate("IAM SDK API", "GetPolicy");

    // Then all activation attempts are retained in chronological order.
    assertArrayLength(registry.activationEvents, 2);
    assertIdentical(registry.activationEvents[0].detail, "CreatePolicy");
    assertTrue(registry.activationEvents[0].activated);
    assertFalse(registry.activationEvents[0].registryDisabled);
    assertIdentical(registry.activationEvents[1].detail, "GetPolicy");
    assertFalse(registry.activationEvents[1].activated);
    assertTrue(registry.activationEvents[1].registryDisabled);
    assertStringIncludes(
      registry.activationEvents[1].ignoredReason ?? "",
      "permanently disabled",
    );
  });
});
