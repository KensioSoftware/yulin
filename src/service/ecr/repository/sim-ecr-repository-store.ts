import type { SimEcrRegistry } from "../registry/sim-ecr-registry.js";
import { SimEcrRepository } from "./sim-ecr-repository.js";
import type { SimEcrRepositoryAddress } from "./sim-ecr-repository-address.js";
import { requiredSimEcrRepositoryName } from "./sim-ecr-repository-name.js";

interface SimEcrRepositoryStoreProperties {
  readonly address: SimEcrRepositoryAddress;
  readonly registry: SimEcrRegistry;
}

/**
 * The repositories one simulated ECR holds, in one account and region.
 *
 * A repository is registered simulation-wide as it is made, because the thing
 * that resolves one is a Lambda function in whichever account and region its
 * own stack deployed into, holding nothing but an image URI.
 */
export class SimEcrRepositoryStore {
  private readonly address: SimEcrRepositoryAddress;
  private readonly registry: SimEcrRegistry;
  private readonly repositoriesByName = new Map<string, SimEcrRepository>();

  constructor(properties: SimEcrRepositoryStoreProperties) {
    this.address = properties.address;
    this.registry = properties.registry;
  }

  /**
   * The repository of this name, made if this is the first mention of it.
   *
   * Naming a repository is what creates it, because a repository here is only
   * ever a name that holds code. That also means a template declaring a
   * repository a test has already registered a handler in adopts that
   * repository rather than replacing it, which is the whole point of the
   * repository outliving the stack.
   */
  repository(repositoryName: string): SimEcrRepository {
    const name = requiredSimEcrRepositoryName(repositoryName);
    const existing = this.repositoriesByName.get(name);

    if (existing !== undefined) {
      return existing;
    }

    const repository = new SimEcrRepository({
      repositoryName: name,
      address: this.address,
    });

    this.repositoriesByName.set(name, repository);
    this.registry.register(repository);

    return repository;
  }

  /**
   * Whether a repository of this name has been made.
   */
  has(repositoryName: string): boolean {
    return this.repositoriesByName.has(repositoryName);
  }

  /**
   * Remove a repository, and the simulated images it holds with it.
   *
   * A repository nothing made is already gone, so removing one is not a
   * failure: a CloudFormation teardown deleting a repository a later stack
   * also declared would otherwise have to know which stack made it.
   */
  delete(repositoryName: string): void {
    const repository = this.repositoriesByName.get(repositoryName);

    if (repository === undefined) {
      return;
    }

    this.repositoriesByName.delete(repositoryName);
    this.registry.deregister(repository);
  }

  /**
   * Every repository this simulated ECR holds.
   */
  all(): readonly SimEcrRepository[] {
    return this.repositoriesByName.values().toArray();
  }
}
