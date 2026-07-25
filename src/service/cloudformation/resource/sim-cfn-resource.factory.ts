import { MappedFactory } from "@kensio/part-factory";

import {
  SimCfnResource,
  type SimCloudFormationResourceProperties as SimCloudFormationResourceProperties,
} from "./sim-cfn-resource.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";

/**
 * Generate fake SimCfnResource instances.
 */
export const simCfnResourceFactory = new MappedFactory<
  SimCloudFormationResourceProperties,
  SimCfnResource
>(
  () => ({
    accountRegionScope: simAwsAccountRegionScopeFactory.make(),
    logicalId: "Resource",
    template: {},
  }),
  (properties) => new SimCfnResource(properties),
);
