import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolClient } from "../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoGroup } from "../user-pool/group/sim-cognito-group.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnCognitoResourceDeleterProperties {
  readonly cognito: SimCognitoIdentityProvider;
}

/**
 * Deletes the simulated Cognito resources a CloudFormation Stack created.
 *
 * An app client and a group both belong to a pool, and each carries the pool it
 * belongs to, so neither has to be found from the template again.
 */
export class SimCfnCognitoResourceDeleter {
  private readonly cognito: SimCognitoIdentityProvider;

  constructor(properties: SimCfnCognitoResourceDeleterProperties) {
    this.cognito = properties.cognito;
  }

  /**
   * Delete a simulated Cognito resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "UserPool": {
        await this.deleteUserPool(resource);
        return;
      }
      case "UserPoolClient": {
        await this.deleteClient(resource);
        return;
      }
      case "UserPoolGroup": {
        await this.deleteGroup(resource);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim Cognito CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private async deleteUserPool(resource: SimCfnResource): Promise<void> {
    const userPool = resource.simResource as SimCognitoUserPool | undefined;
    assertDefined(
      userPool,
      `sim Cognito user pool for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.cognito.deleteUserPool({ input: { UserPoolId: userPool.id } });
  }

  private async deleteClient(resource: SimCfnResource): Promise<void> {
    const client = resource.simResource as SimCognitoUserPoolClient | undefined;
    assertDefined(
      client,
      `sim Cognito app client for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.cognito.deleteUserPoolClient({
      input: { UserPoolId: client.userPoolId, ClientId: client.id },
    });
  }

  private async deleteGroup(resource: SimCfnResource): Promise<void> {
    const group = resource.simResource as SimCognitoGroup | undefined;
    assertDefined(
      group,
      `sim Cognito group for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.cognito.deleteGroup({
      input: { UserPoolId: group.userPoolId, GroupName: group.name },
    });
  }
}
