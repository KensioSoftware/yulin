import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolClient } from "../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoGroup } from "../user-pool/group/sim-cognito-group.js";
import type { SimCognitoUserPoolDomain } from "../user-pool/domain/sim-cognito-user-pool-domain.js";
import type { SimCognitoUserPoolIdentityProvider } from "../user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnCognitoResourceDeleterProperties {
  readonly cognito: SimCognitoIdentityProvider;
}

/**
 * Deletes the simulated Cognito resources a CloudFormation Stack created.
 *
 * An app client, a group, a domain and an identity provider all belong to a
 * pool, and each carries the pool it belongs to, so none of them has to be
 * found from the template again.
 */
export class SimCfnCognitoResourceDeleter {
  private readonly cognito: SimCognitoIdentityProvider;

  constructor(properties: SimCfnCognitoResourceDeleterProperties) {
    this.cognito = properties.cognito;
  }

  /**
   * Refuse a Resource type this service has no deletion for.
   *
   * A Stack teardown records this refusal and steps over it, rather than
   * failing, which is what the wording is read for.
   */
  private static unsupported(resourceTypeName: string): never {
    throw new Error(
      `Unsupported sim Cognito CloudFormation Resource ` +
        `${resourceTypeName} deletion`,
    );
  }

  /**
   * The simulated resource a Stack created for a template entry.
   *
   * Every deletion here needs the same thing: the resource the creation left
   * on the template entry, which is gone only if the Resource was never
   * deployed.
   */
  private static created<TResource>(
    resource: SimCfnResource,
    description: string,
  ): TResource {
    const created = resource.simResource as TResource | undefined;
    assertDefined(
      created,
      `sim Cognito ${description} for Resource ${resource.logicalId}`,
    );

    return created;
  }

  /**
   * Delete a simulated Cognito resource created from a CloudFormation
   * Resource.
   *
   * The deletions are held by Resource type name rather than switched on, so
   * this stays one lookup however many types the service deploys.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    const deletion =
      this.deletions().get(resourceTypeName) ??
      SimCfnCognitoResourceDeleter.unsupported(resourceTypeName);

    await deletion(resource);
  }

  /**
   * What deletes each Resource type this service deploys.
   */
  private deletions(): ReadonlyMap<
    string,
    (resource: SimCfnResource) => Promise<void>
  > {
    return new Map([
      [
        "UserPool",
        async (resource: SimCfnResource) => {
          await this.deleteUserPool(resource);
        },
      ],
      [
        "UserPoolClient",
        async (resource: SimCfnResource) => {
          await this.deleteClient(resource);
        },
      ],
      [
        "UserPoolGroup",
        async (resource: SimCfnResource) => {
          await this.deleteGroup(resource);
        },
      ],
      [
        "UserPoolDomain",
        async (resource: SimCfnResource) => {
          await this.deleteDomain(resource);
        },
      ],
      [
        "UserPoolIdentityProvider",
        async (resource: SimCfnResource) => {
          await this.deleteIdentityProvider(resource);
        },
      ],
    ]);
  }

  private async deleteDomain(resource: SimCfnResource): Promise<void> {
    const domain =
      SimCfnCognitoResourceDeleter.created<SimCognitoUserPoolDomain>(
        resource,
        "domain",
      );

    await this.cognito.deleteUserPoolDomain({
      input: { UserPoolId: domain.userPoolId, Domain: domain.value },
    });
  }

  private async deleteIdentityProvider(
    resource: SimCfnResource,
  ): Promise<void> {
    const provider =
      SimCfnCognitoResourceDeleter.created<SimCognitoUserPoolIdentityProvider>(
        resource,
        "identity provider",
      );

    await this.cognito.deleteIdentityProvider({
      input: {
        UserPoolId: provider.userPoolId,
        ProviderName: provider.name,
      },
    });
  }

  private async deleteUserPool(resource: SimCfnResource): Promise<void> {
    const userPool = SimCfnCognitoResourceDeleter.created<SimCognitoUserPool>(
      resource,
      "user pool",
    );

    await this.cognito.deleteUserPool({ input: { UserPoolId: userPool.id } });
  }

  private async deleteClient(resource: SimCfnResource): Promise<void> {
    const client =
      SimCfnCognitoResourceDeleter.created<SimCognitoUserPoolClient>(
        resource,
        "app client",
      );

    await this.cognito.deleteUserPoolClient({
      input: { UserPoolId: client.userPoolId, ClientId: client.id },
    });
  }

  private async deleteGroup(resource: SimCfnResource): Promise<void> {
    const group = SimCfnCognitoResourceDeleter.created<SimCognitoGroup>(
      resource,
      "group",
    );

    await this.cognito.deleteGroup({
      input: { UserPoolId: group.userPoolId, GroupName: group.name },
    });
  }
}
