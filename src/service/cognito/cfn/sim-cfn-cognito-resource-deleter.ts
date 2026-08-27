import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolClient } from "../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoGroup } from "../user-pool/group/sim-cognito-group.js";
import type { SimCognitoUserPoolDomain } from "../user-pool/domain/sim-cognito-user-pool-domain.js";
import type { SimCognitoUserPoolIdentityProvider } from "../user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

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
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const deletion =
      this.deletions(options).get(resourceTypeName) ??
      SimCfnCognitoResourceDeleter.unsupported(resourceTypeName);

    await deletion(resource);
  }

  /**
   * What deletes each Resource type this service deploys.
   */
  private deletions(
    options: SimCfnResourceCallerOptions,
  ): ReadonlyMap<string, (resource: SimCfnResource) => Promise<void>> {
    return new Map([
      [
        "UserPool",
        async (resource: SimCfnResource) => {
          await this.deleteUserPool(resource, options);
        },
      ],
      [
        "UserPoolClient",
        async (resource: SimCfnResource) => {
          await this.deleteClient(resource, options);
        },
      ],
      [
        "UserPoolGroup",
        async (resource: SimCfnResource) => {
          await this.deleteGroup(resource, options);
        },
      ],
      [
        "UserPoolDomain",
        async (resource: SimCfnResource) => {
          await this.deleteDomain(resource, options);
        },
      ],
      [
        "UserPoolIdentityProvider",
        async (resource: SimCfnResource) => {
          await this.deleteIdentityProvider(resource, options);
        },
      ],
    ]);
  }

  private async deleteDomain(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const domain =
      SimCfnCognitoResourceDeleter.created<SimCognitoUserPoolDomain>(
        resource,
        "domain",
      );

    await this.cognito.deleteUserPoolDomain(
      { input: { UserPoolId: domain.userPoolId, Domain: domain.value } },
      options,
    );
  }

  private async deleteIdentityProvider(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const provider =
      SimCfnCognitoResourceDeleter.created<SimCognitoUserPoolIdentityProvider>(
        resource,
        "identity provider",
      );

    await this.cognito.deleteIdentityProvider(
      {
        input: {
          UserPoolId: provider.userPoolId,
          ProviderName: provider.name,
        },
      },
      options,
    );
  }

  private async deleteUserPool(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const userPool = SimCfnCognitoResourceDeleter.created<SimCognitoUserPool>(
      resource,
      "user pool",
    );

    await this.cognito.deleteUserPool(
      { input: { UserPoolId: userPool.id } },
      options,
    );
  }

  private async deleteClient(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const client =
      SimCfnCognitoResourceDeleter.created<SimCognitoUserPoolClient>(
        resource,
        "app client",
      );

    await this.cognito.deleteUserPoolClient(
      { input: { UserPoolId: client.userPoolId, ClientId: client.id } },
      options,
    );
  }

  private async deleteGroup(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const group = SimCfnCognitoResourceDeleter.created<SimCognitoGroup>(
      resource,
      "group",
    );

    await this.cognito.deleteGroup(
      { input: { UserPoolId: group.userPoolId, GroupName: group.name } },
      options,
    );
  }
}
