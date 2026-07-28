import { SimKmsAlias } from "../../../../kms/key/sim-kms-alias.js";
import { SimKmsKey } from "../../../../kms/key/sim-kms-key.js";
import { SimKmsAliasCfn } from "./sim-kms-alias-cfn.js";
import { SimKmsKeyCfn } from "./sim-kms-key-cfn.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * The CloudFormation-facing value adapter for a simulated KMS Resource.
 */
export function kmsValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::KMS::Key" &&
    properties.simResource instanceof SimKmsKey
  ) {
    return new SimKmsKeyCfn({ key: properties.simResource });
  }

  if (
    properties.type === "AWS::KMS::Alias" &&
    properties.simResource instanceof SimKmsAlias
  ) {
    return new SimKmsAliasCfn({ alias: properties.simResource });
  }

  return undefined;
}
