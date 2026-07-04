import { MappedFactory } from "@kensio/part-factory";

import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimCfnResource,
  type SimCloudFormationResourceProps,
} from "./sim-cfn-resource.js";

/**
 * Generate fake SimCfnResource instances.
 */
export const simCfnResourceFactory = new MappedFactory<
  SimCloudFormationResourceProps,
  SimCfnResource
>(
  () => ({
    accountRegionScope: simAwsAccountRegionScopeFactory.make(),
    logicalId: "Resource",
    template: {},
  }),
  (props) => new SimCfnResource(props),
);
