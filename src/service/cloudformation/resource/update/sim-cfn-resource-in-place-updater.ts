import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfnResource } from "../sim-cfn-resource.js";
import { simCfnResourceServiceFactory } from "../resolve/service/sim-cfn-resource-service-factory.js";
import { simCfnResourceUpdateError } from "./sim-cfn-resource-update-error.js";

interface SimCfnResourceInPlaceUpdaterProperties {
  readonly current: SimCfnResource;
  readonly updated: SimCfnResource;
}

interface ApplySimCfnResourceInPlaceUpdateProperties {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Applies one Resource change to the deployed Resource, without replacing it.
 *
 * The new Resource record takes the deployed simulated AWS object on from the
 * one it replaces in the Stack's map. That is what carries the bucket's
 * contents or the secret's versions across an update, and what leaves the
 * Resource reporting CREATE_COMPLETE rather than starting again as pending.
 *
 * Both property sets are resolved against the Resources the Stack holds now.
 * Nothing has been deleted or created at this point, so a Ref reaches a
 * deployed Resource's physical name from either side.
 */
export class SimCfnResourceInPlaceUpdater {
  private readonly current: SimCfnResource;
  private readonly updated: SimCfnResource;

  constructor(properties: SimCfnResourceInPlaceUpdaterProperties) {
    this.current = properties.current;
    this.updated = properties.updated;
  }

  /**
   * Apply the change, and move the new Resource record on to what it left in
   * simulated AWS.
   */
  async apply(
    properties: ApplySimCfnResourceInPlaceUpdateProperties,
  ): Promise<void> {
    const { current, updated } = this;
    const { simAws, resources, caller } = properties;
    const service = simCfnResourceServiceFactory(simAws, updated);

    // The plan only lists a Resource whose service has both update hooks.
    assertDefined(
      service,
      `sim CloudFormation service for Resource ${updated.logicalId} to update`,
    );

    const { factory, resourceTypeName } = service;
    const updateInPlace = factory.updateInPlace?.bind(factory);
    assertDefined(
      updateInPlace,
      `sim CloudFormation in-place update for Resource ${updated.logicalId}`,
    );

    updated.markCreateInProgress();

    try {
      const simResource = await updateInPlace(
        resourceTypeName,
        current,
        updated,
        {
          simAws,
          resources,
          currentResolvedProperties: await current.resolvedProperties({
            simAws,
            resources,
            caller,
          }),
          updatedResolvedProperties: await updated.resolvedProperties({
            simAws,
            resources,
            caller,
          }),
          caller,
        },
      );

      updated.markCreateComplete(simResource);
    } catch (error) {
      const updateError = simCfnResourceUpdateError(updated, error);

      updated.markCreateFailed(updateError);

      throw updateError;
    }
  }
}
