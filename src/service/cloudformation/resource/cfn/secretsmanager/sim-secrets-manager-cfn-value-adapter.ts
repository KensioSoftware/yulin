import { SimSecretsManagerSecret } from "../../../../secretsmanager/secret/sim-secrets-manager-secret.js";
import { SimSecretsManagerSecretCfn } from "./sim-secrets-manager-secret-cfn.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * The CloudFormation-facing value adapter for a simulated Secrets Manager
 * Resource.
 */
export function secretsManagerValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::SecretsManager::Secret" &&
    properties.simResource instanceof SimSecretsManagerSecret
  ) {
    return new SimSecretsManagerSecretCfn({ secret: properties.simResource });
  }

  return undefined;
}
