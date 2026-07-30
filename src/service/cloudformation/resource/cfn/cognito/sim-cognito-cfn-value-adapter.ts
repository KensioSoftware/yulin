import { SimCognitoGroup } from "../../../../cognito/user-pool/group/sim-cognito-group.js";
import { SimCognitoUserPoolClient } from "../../../../cognito/user-pool/client/sim-cognito-user-pool-client.js";
import { SimCognitoUserPool } from "../../../../cognito/user-pool/sim-cognito-user-pool.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimCognitoUserPoolCfn } from "./sim-cognito-user-pool-cfn.js";
import { SimCognitoUserPoolClientCfn } from "./sim-cognito-user-pool-client-cfn.js";
import { SimCognitoUserPoolGroupCfn } from "./sim-cognito-user-pool-group-cfn.js";

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

  return undefined;
}
