import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { SimCfnResourceInPlaceUpdater } from "../../resource/update/sim-cfn-resource-in-place-updater.js";
import { simCfnResourceServiceFactory } from "../../resource/resolve/service/sim-cfn-resource-service-factory.js";
import { SimCfnResourceUpdateValidator } from "../../resource/update/sim-cfn-resource-update-validator.js";
import type { SimCfnStackResourceChange } from "./sim-cfn-stack-resource-change-pairs.js";

interface SimCfnStackResourceUpdatesProperties {
  readonly simAws: SimAws;

  /** The principal the update runs as, as creation carries it. */
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * The Resource changes a Stack update applies to the deployed Resources,
 * rather than by replacing them.
 *
 * Which changes those are is the owning service's answer, given before the
 * update touches anything. A service with no way to change a deployed Resource
 * answers nothing, and every change to its Resources is a replacement.
 */
export class SimCfnStackResourceUpdates {
  private readonly simAws: SimAws;
  private readonly caller: SimAwsCaller | undefined;

  constructor(properties: SimCfnStackResourceUpdatesProperties) {
    this.simAws = properties.simAws;
    this.caller = properties.caller;
  }

  /**
   * Whether the service owning a Resource can apply this change to the
   * deployed Resource.
   *
   * A Resource type no service simulates cannot be updated where it is. Its
   * creation was skipped, so there is nothing deployed to change.
   */
  claimed(current: SimCfnResource, updated: SimCfnResource): boolean {
    if (updated.type === undefined || current.type !== updated.type) {
      return false;
    }

    const service = simCfnResourceServiceFactory(this.simAws, updated);

    // Both halves or neither. A service that can recognise a change it can
    // apply but cannot apply it would leave the update with nothing to run.
    if (
      service?.factory.updatesInPlace === undefined ||
      service.factory.updateInPlace === undefined
    ) {
      return false;
    }

    return service.factory.updatesInPlace(
      service.resourceTypeName,
      current,
      updated,
    );
  }

  /**
   * Validate every Resource replacement before the update changes the Stack.
   */
  async assertAllowed(
    currentResources: ReadonlyMap<string, SimCfnResource>,
    updatedResources: ReadonlyMap<string, SimCfnResource>,
    replacements: readonly SimCfnStackResourceChange[],
  ): Promise<void> {
    await Promise.all(
      replacements.map(async ({ current, updated }) => {
        await new SimCfnResourceUpdateValidator({
          current,
          updated,
        }).assertAllowed({
          simAws: this.simAws,
          currentResources,
          updatedResources,
          caller: this.caller,
        });
      }),
    );
  }

  /**
   * Apply the given changes to the deployed Resources.
   *
   * Each one is independent of the others, since none of them creates or
   * deletes anything another could be waiting on.
   */
  async apply(
    resources: ReadonlyMap<string, SimCfnResource>,
    updates: readonly SimCfnStackResourceChange[],
  ): Promise<void> {
    await Promise.all(
      updates.map(async ({ current, updated }) => {
        await new SimCfnResourceInPlaceUpdater({ current, updated }).apply({
          simAws: this.simAws,
          resources,
          caller: this.caller,
        });
      }),
    );
  }
}
