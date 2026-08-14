import { SimCognitoGroup } from "../../../../cognito/user-pool/group/sim-cognito-group.js";
import { SimCognitoUserPoolClient } from "../../../../cognito/user-pool/client/sim-cognito-user-pool-client.js";
import { SimCognitoUserPool } from "../../../../cognito/user-pool/sim-cognito-user-pool.js";
import { SimCognitoUserPoolDomain } from "../../../../cognito/user-pool/domain/sim-cognito-user-pool-domain.js";
import { SimCognitoUserPoolIdentityProvider } from "../../../../cognito/user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimCognitoUserPoolCfn } from "./sim-cognito-user-pool-cfn.js";
import { SimCognitoUserPoolClientCfn } from "./sim-cognito-user-pool-client-cfn.js";
import { SimCognitoUserPoolGroupCfn } from "./sim-cognito-user-pool-group-cfn.js";
import { SimCognitoIdentityProviderCfn } from "./sim-cognito-idp-cfn.js";
import { SimCognitoUserPoolDomainCfn } from "./sim-cognito-user-pool-domain-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated Cognito Resource.
 */
export function cognitoValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::Cognito::UserPool" &&
    properties.simResource instanceof SimCognitoUserPool
  ) {
    return new SimCognitoUserPoolCfn({ pool: properties.simResource });
  }

  if (
    properties.type === "AWS::Cognito::UserPoolClient" &&
    properties.simResource instanceof SimCognitoUserPoolClient
  ) {
    return new SimCognitoUserPoolClientCfn({ client: properties.simResource });
  }

  if (
    properties.type === "AWS::Cognito::UserPoolGroup" &&
    properties.simResource instanceof SimCognitoGroup
  ) {
    return new SimCognitoUserPoolGroupCfn({ group: properties.simResource });
  }

  if (
    properties.type === "AWS::Cognito::UserPoolDomain" &&
    properties.simResource instanceof SimCognitoUserPoolDomain
  ) {
    return new SimCognitoUserPoolDomainCfn({ domain: properties.simResource });
  }

  if (
    properties.type === "AWS::Cognito::UserPoolIdentityProvider" &&
    properties.simResource instanceof SimCognitoUserPoolIdentityProvider
  ) {
    return new SimCognitoIdentityProviderCfn({
      provider: properties.simResource,
    });
  }

  return undefined;
}
