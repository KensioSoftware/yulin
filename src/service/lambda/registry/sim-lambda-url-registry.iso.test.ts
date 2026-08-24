import {
  assertIdentical,
  assertSetSize,
  assertStringMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimLambdaFunctionUrlId } from "../function/url/sim-lambda-function-url.js";
import { SimLambdaUrlRegistry } from "./sim-lambda-url-registry.js";

const accountId = "111111111111" as SimAwsAccountId;

describe("Sim Lambda URL registry", () => {
  it("allocates URL ids that are one DNS label", () => {
    // Given a Function URL registry.
    const registry = new SimLambdaUrlRegistry();

    // When a URL id is allocated.
    const urlId = registry.allocateFunctionUrlId();

    // Then it is a single lowercase alphanumeric label.
    assertStringMatches(urlId, /^[a-z0-9]{32}$/);
  });

  it("allocates distinct URL ids", () => {
    // Given a Function URL registry.
    const registry = new SimLambdaUrlRegistry();

    // When several URL ids are allocated.
    const urlIds = new Set(
      Array.from({ length: 20 }, () => registry.allocateFunctionUrlId()),
    );

    // Then they are all different.
    assertSetSize(urlIds, 20);
  });

  it("resolves a registered URL id to its account", () => {
    // Given a registered Function URL id.
    const registry = new SimLambdaUrlRegistry();
    const urlId = registry.allocateFunctionUrlId();
    registry.registerFunctionUrl(urlId, accountId);

    // When the owning account is looked up.
    const owner = registry.accountIdForFunctionUrl(urlId);

    // Then the account that registered it is returned.
    assertIdentical(owner, accountId);
  });

  it("does not resolve an unregistered URL id", () => {
    // Given a Function URL registry.
    const registry = new SimLambdaUrlRegistry();

    // When an unknown URL id is looked up.
    const owner = registry.accountIdForFunctionUrl(
      "unknown" as SimLambdaFunctionUrlId,
    );

    // Then nothing is found.
    assertUndefined(owner);
  });

  it("forgets a deregistered URL id", () => {
    // Given a registered Function URL id.
    const registry = new SimLambdaUrlRegistry();
    const urlId = registry.allocateFunctionUrlId();
    registry.registerFunctionUrl(urlId, accountId);

    // When it is deregistered.
    registry.deregisterFunctionUrl(urlId);

    // Then it no longer resolves to an account.
    assertUndefined(registry.accountIdForFunctionUrl(urlId));
  });
});
