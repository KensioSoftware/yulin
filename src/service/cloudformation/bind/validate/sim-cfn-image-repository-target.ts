/**
 * The container image repository an executable binding targets.
 *
 * A binding names a repository, such as
 * `111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders`, and matches any
 * template function whose `Code.ImageUri` names that repository.
 *
 * The tag is ignored on both sides, because no tag is stable enough to write
 * into a test. A CDK image asset is tagged with the asset content hash, which
 * changes whenever the source does, and a pipeline-built image is usually
 * tagged with a git sha or build number injected as a stack parameter. A
 * digest is ignored for the same reason.
 *
 * The registry host is part of the repository, so the account and region have
 * to match too. That keeps a binding from reaching a same-named repository in
 * another account.
 */
export class SimCfnImageRepositoryTarget {
  private readonly repository: string;

  constructor(imageRepository: string) {
    this.repository = repositoryOf(imageRepository);
  }

  /**
   * Whether a function's image URI names this repository.
   */
  matchesImageUri(imageUri: string | undefined): boolean {
    if (imageUri === undefined) {
      return false;
    }

    return repositoryOf(imageUri) === this.repository;
  }
}

/**
 * An image reference with any tag or digest removed.
 *
 * A registry host can carry a port, as in `registry.test:5000/orders`, so the
 * tag separator is only looked for in the last path segment. Repository names
 * are lower case on ECR, and a registry host is a DNS name, so comparing in
 * lower case matches how a registry would read the two references.
 */
function repositoryOf(reference: string): string {
  const trimmed = reference.trim();
  const lastSlash = trimmed.lastIndexOf("/");
  const registryPath = trimmed.slice(0, lastSlash + 1);
  const name = trimmed.slice(lastSlash + 1);

  return `${registryPath}${untagged(name)}`.toLowerCase();
}

/**
 * The repository name with a `:tag` or `@digest` suffix removed.
 */
function untagged(name: string): string {
  const separators = [name.indexOf(":"), name.indexOf("@")].filter(
    (index) => index >= 0,
  );

  if (separators.length === 0) {
    return name;
  }

  return name.slice(0, Math.min(...separators));
}
