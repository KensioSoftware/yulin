import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import { SimEcrAuthorizer } from "./authorize/sim-ecr-authorizer.js";
import { SimEcrCfnResourceFactory } from "./cfn/sim-ecr-cfn-resource-factory.js";
import { SimEcrRegistry } from "./registry/sim-ecr-registry.js";
import { SimEcrRepositoryAddress } from "./repository/sim-ecr-repository-address.js";
import type { SimEcrRepository } from "./repository/sim-ecr-repository.js";
import { SimEcrRepositoryStore } from "./repository/sim-ecr-repository-store.js";

interface SimEcrProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly registry?: SimEcrRegistry;
}

/**
 * Simulated ECR. Holds repositories, each holding images by tag.
 *
 * There are no SDK commands here, and that is deliberate. What this service is
 * for is saying what an image actually is, and real ECR has no operation that
 * could say it: `PutImage` takes a manifest for layers pushed over the Docker
 * registry protocol, none of which exists in this process. So registering a
 * handler as an image is a Yulin-native operation, named so it cannot be
 * mistaken for a simulated `PutImage`.
 *
 * Repositories are scoped to an account and region, as they are on real AWS:
 * a repository ARN names the region, and the registry host in an image URI
 * carries both the account and the region.
 *
 * Nothing a test does here is authorized, for the same reason. Naming a
 * repository is the simulator's own accessor, and no principal makes that
 * request. A CloudFormation deployment does make one, and a Stack making or
 * removing a repository is decided by simulated IAM as the caller it named.
 */
export class SimEcr {
  private readonly repositories: SimEcrRepositoryStore;
  private readonly cfnFactory: SimEcrCfnResourceFactory;

  constructor(properties: SimEcrProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      registry = new SimEcrRegistry(),
    } = properties;

    const address = new SimEcrRepositoryAddress(accountRegionScope);

    this.repositories = new SimEcrRepositoryStore({ address, registry });
    this.cfnFactory = new SimEcrCfnResourceFactory({
      ecr: this,
      authorizer: new SimEcrAuthorizer({
        iam: simIamInRegion(properties.iam, accountRegionScope.regionName),
        address,
      }),
    });
  }

  /**
   * The repository of this name, made if this is the first mention of it.
   *
   * Naming a repository is what creates it. A repository holds no state of its
   * own beyond the images registered in it, so there is nothing to declare
   * before registering one, and a test can name the repository its templates
   * already point at.
   */
  repository(repositoryName: string): SimEcrRepository {
    return this.repositories.repository(repositoryName);
  }

  /**
   * Whether a repository of this name has been made.
   */
  hasRepository(repositoryName: string): boolean {
    return this.repositories.has(repositoryName);
  }

  /**
   * Remove a repository, and the simulated images it holds with it.
   */
  deleteRepository(repositoryName: string): void {
    this.repositories.delete(repositoryName);
  }

  /**
   * Every repository this simulated ECR holds.
   */
  allRepositories(): readonly SimEcrRepository[] {
    return this.repositories.all();
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }
}
