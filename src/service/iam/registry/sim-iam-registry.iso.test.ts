import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIam } from "../sim-iam.js";
import { SimIamRegistry } from "./sim-iam-registry.js";

const firstAccountId = makeSimAwsAccountId();
const secondAccountId = makeSimAwsAccountId();

describe("SimIamRegistry", () => {
  it("throws a diagnostic error for an unregistered Account", () => {
    // Given a new sim IAM registry.
    const registry = new SimIamRegistry();

    // When IAM is resolved for an unregistered Account.
    const error = assertThrowsError(() => {
      registry.iamForAccount(firstAccountId);
    });

    // Then the missing registration is identified.
    assertIdentical(
      error.message,
      `Sim IAM is not registered for Account ${firstAccountId}`,
    );
  });

  it("registers and resolves IAM for an Account", () => {
    // Given a new sim IAM registry and IAM facade.
    const registry = new SimIamRegistry();
    const iam = new SimIam();

    // When IAM is registered for an Account.
    registry.register(firstAccountId, iam);

    // Then the exact IAM facade is resolved for that Account.
    assertIdentical(registry.iamForAccount(firstAccountId), iam);
  });

  it("resolves separate IAM facades for separate Accounts", () => {
    // Given IAM facades belonging to two Accounts.
    const registry = new SimIamRegistry();
    const firstIam = new SimIam();
    const secondIam = new SimIam();

    // When both facades are registered.
    registry.register(firstAccountId, firstIam);
    registry.register(secondAccountId, secondIam);

    // Then each Account resolves its own IAM facade.
    assertIdentical(registry.iamForAccount(firstAccountId), firstIam);
    assertIdentical(registry.iamForAccount(secondAccountId), secondIam);
  });

  it("allows the same IAM facade to be registered again", () => {
    // Given an IAM facade already registered for an Account.
    const registry = new SimIamRegistry();
    const iam = new SimIam();
    registry.register(firstAccountId, iam);

    // When the same registration is repeated.
    registry.register(firstAccountId, iam);

    // Then the original IAM facade remains registered.
    assertIdentical(registry.iamForAccount(firstAccountId), iam);
  });

  it("rejects a different IAM facade for an already registered Account", () => {
    // Given an Account with a registered IAM facade.
    const registry = new SimIamRegistry();
    const firstIam = new SimIam();
    const secondIam = new SimIam();
    registry.register(firstAccountId, firstIam);

    // When a different facade is registered for the same Account.
    const error = assertThrowsError(() => {
      registry.register(firstAccountId, secondIam);
    });

    // Then the conflicting registration fails without replacing the first facade.
    assertIdentical(
      error.message,
      `A different SimIam is already registered for Account ${firstAccountId}`,
    );
    assertIdentical(registry.iamForAccount(firstAccountId), firstIam);
  });

  it("keeps registrations isolated between registry instances", () => {
    // Given two independent sim IAM registries.
    const firstRegistry = new SimIamRegistry();
    const secondRegistry = new SimIamRegistry();
    const iam = new SimIam();

    // When IAM is registered in only the first registry.
    firstRegistry.register(firstAccountId, iam);

    // Then the first registry resolves it and the second reports it as missing.
    assertIdentical(firstRegistry.iamForAccount(firstAccountId), iam);
    const error = assertThrowsError(() => {
      secondRegistry.iamForAccount(firstAccountId);
    });
    assertIdentical(
      error.message,
      `Sim IAM is not registered for Account ${firstAccountId}`,
    );
  });
});
