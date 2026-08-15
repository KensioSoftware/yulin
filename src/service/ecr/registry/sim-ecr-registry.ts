import { SimEcrImageReference } from "../image/sim-ecr-image-reference.js";
import type { SimEcrRepository } from "../repository/sim-ecr-repository.js";

/**
 * Simulation-wide registry of simulated ECR repositories.
 *
 * One registry belongs to one SimAws environment. ECR is scoped to an account
 * and region, but the thing that resolves a repository holds only an image
 * URI: a Lambda function created in one account and region can run an image
 * from another account's registry, as it can on real AWS.
 *
 * Repositories are indexed by their image reference rather than their name,
 * since the registry host in that reference is what carries the account and
 * the region. Reading a reference here and matching one in a deploy-time image
 * binding are the same reading, so a repository is found by whatever tag or
 * digest a template happened to name it with.
 *
 * The registry indexes repositories but does not create or own them.
 */
export class SimEcrRegistry {
  private readonly repositoriesByReference = new Map<
    string,
    SimEcrRepository
  >();

  /**
   * Register a repository, under the image reference that names it.
   */
  register(repository: SimEcrRepository): void {
    this.repositoriesByReference.set(referenceKey(repository), repository);
  }

  /**
   * Remove a repository from the index.
   */
  deregister(repository: SimEcrRepository): void {
    this.repositoriesByReference.delete(referenceKey(repository));
  }

  /**
   * The repository an image URI names, wherever in the simulation it lives.
   *
   * Undefined means no simulated ECR anywhere holds that repository, which is
   * a different thing from a repository holding no image. Callers report the
   * two apart, because they send a reader to different places.
   */
  repositoryFor(imageUri: string): SimEcrRepository | undefined {
    return this.repositoriesByReference.get(
      new SimEcrImageReference(imageUri).repositoryKey(),
    );
  }
}

function referenceKey(repository: SimEcrRepository): string {
  return new SimEcrImageReference(repository.repositoryUri).repositoryKey();
}
