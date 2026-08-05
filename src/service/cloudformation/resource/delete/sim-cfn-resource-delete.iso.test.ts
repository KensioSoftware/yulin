import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCfnResource } from "../sim-cfn-resource.js";
import type {
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";

interface DeletingFactory extends SimCfnServiceResourceFactory {
  readonly deleted: string[];
}

/**
 * A factory that records what it was asked to delete, and can be told to
 * refuse.
 */
function deletingFactory(refusal?: Error | string): DeletingFactory {
  const deleted: string[] = [];

  return {
    deleted,

    async create(): Promise<object> {
      await Promise.resolve();

      return { created: true };
    },

    async delete(resourceTypeName): Promise<void> {
      await Promise.resolve();

      if (refusal !== undefined) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw refusal;
      }

      deleted.push(resourceTypeName);
    },
  };
}

describe("SimCfnResource deletion", () => {
  const resourceFor = (
    simAws: SimAws,
    cfnResourceFactory: SimCfnServiceResourceFactory,
  ): SimCfnResource =>
    new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: { Type: "AWS::S3::Bucket" },
      cfnResourceFactory,
    });

  const contextFor = (
    simAws: SimAws,
    resource: SimCfnResource,
  ): SimCloudFormationResourceCreateContext &
    SimCloudFormationResourceDeleteContext => ({
    simAws,
    resources: new Map([["TestResource", resource]]),
  });

  it("asks the service factory to delete a created Resource", async () => {
    // Given a created Resource with an isolated factory injected.
    const simAws = new SimAws();
    const factory = deletingFactory();
    const resource = resourceFor(simAws, factory);
    const context = contextFor(simAws, resource);

    await resource.create(context);

    // When the Resource is deleted.
    await resource.delete(context);

    // Then the factory was asked for the Resource type, and the Resource
    // reports a completed deletion.
    assertArrayLength(factory.deleted, 1);
    assertIdentical(factory.deleted[0], "Bucket");
    assertIdentical(resource.status, "DELETE_COMPLETE");
    assertTrue(resource.deleted);
    assertTrue(resource.deleteComplete);
    assertFalse(resource.deletionSkipped);
    assertUndefined(resource.error);
  });

  it("leaves a Resource that was never created alone", async () => {
    // Given a Resource nothing has created.
    const simAws = new SimAws();
    const factory = deletingFactory();
    const resource = resourceFor(simAws, factory);

    // When the Resource is deleted.
    await resource.delete(contextFor(simAws, resource));

    // Then nothing was asked to delete it, and it is delete-complete anyway,
    // so a partly deployed Stack can still be torn down.
    assertArrayLength(factory.deleted, 0);
    assertIdentical(resource.status, "DELETE_COMPLETE");
  });

  it("records a Resource type nothing can delete rather than failing", async () => {
    // Given a created Resource whose factory has no way to delete its type.
    const simAws = new SimAws();
    const resource = resourceFor(
      simAws,
      deletingFactory(
        new Error("Unsupported sim Widget CloudFormation Resource Gadget"),
      ),
    );
    const context = contextFor(simAws, resource);

    await resource.create(context);

    // When the Resource is deleted.
    await resource.delete(context);

    // Then the deletion is recorded as skipped, the same way an unsupported
    // Resource type is on creation, and the teardown carries on.
    assertIdentical(resource.status, "DELETE_COMPLETE");
    assertTrue(resource.deletionSkipped);
    assertFalse(resource.deleted);
    assertNonNullable(resource.deletionSkippedReason);
    assertStringIncludes(resource.deletionSkippedReason, "Gadget");
  });

  it("fails the Resource when its service refuses the deletion", async () => {
    // Given a created Resource whose service refuses to delete it.
    const simAws = new SimAws();
    const resource = resourceFor(
      simAws,
      deletingFactory(new Error("Bucket is not empty")),
    );
    const context = contextFor(simAws, resource);

    await resource.create(context);

    // When the Resource is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      resource.delete(context),
    );

    // Then the failure names the Resource and is kept on it.
    assertStringIncludes(
      error.message,
      "Sim CloudFormation Resource TestResource deletion failed: Bucket is not empty",
    );
    assertIdentical(resource.status, "DELETE_FAILED");
    assertTrue(resource.deleteComplete);
    assertFalse(resource.deleted);
    assertIdentical(resource.error, error);
  });

  it("wraps non-Error deletion failures", async () => {
    // Given a created Resource whose factory rejects with a non-Error value.
    const simAws = new SimAws();
    const resource = resourceFor(simAws, deletingFactory("factory failed"));
    const context = contextFor(simAws, resource);

    await resource.create(context);

    // When the Resource is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      resource.delete(context),
    );

    // Then the thrown value is reported as a Resource deletion failure.
    assertStringIncludes(
      error.message,
      "Sim CloudFormation Resource TestResource deletion failed: factory failed",
    );
  });
});
