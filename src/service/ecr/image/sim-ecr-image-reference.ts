import { SimCfnImageRepositoryTarget } from "../../cloudformation/bind/validate/sim-cfn-image-repository-target.js";

/**
 * A container image reference, read as the repository it names and the tag it
 * asks for.
 *
 * The repository half is read by {@link SimCfnImageRepositoryTarget}, which
 * deploy-time image bindings already match on, so an image URI is understood
 * one way wherever it arrives from. That normalised repository is what a
 * simulated repository is indexed by, since a registry host carries the
 * account and the region, and a same-named repository in another account is a
 * different repository.
 *
 * The tag is kept apart because it is not part of that identity. Resolution
 * ignores it, in that a reference to a tag no simulated image carries still
 * finds the repository. It is read here so a repository holding more than one
 * simulated image can answer with the one the reference asked for.
 */
export class SimEcrImageReference {
  private readonly reference: string;
  private readonly target: SimCfnImageRepositoryTarget;

  constructor(reference: string) {
    this.reference = reference.trim();
    this.target = new SimCfnImageRepositoryTarget(this.reference);
  }

  /**
   * The repository this reference names, in the form repositories are indexed
   * by.
   */
  repositoryKey(): string {
    return this.target.repositoryReference();
  }

  /**
   * The tag this reference asks for, where it names one.
   *
   * A reference by digest asks for no tag, and neither does a bare repository
   * name. Both leave the repository to answer with whichever image it holds.
   */
  imageTag(): string | undefined {
    const name = this.reference.slice(this.reference.lastIndexOf("/") + 1);
    const separator = name.indexOf(":");

    if (separator === -1 || name.includes("@")) {
      return undefined;
    }

    return name.slice(separator + 1);
  }
}
