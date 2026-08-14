import { SimEcrInvalidParameterException } from "../error/sim-ecr.error.js";

const minimumLength = 2;
const maximumLength = 256;

/** What a repository name is made of between its separators. */
const namePartPattern = /^[a-z0-9]+$/;

/** The separators a repository name may have between those parts. */
const nameSeparators = /[._\-/]/;

/**
 * Read a repository name, refusing one real ECR would refuse.
 *
 * A repository name is a name rather than a URI: the account, the region and
 * the registry host around it come from the simulated ECR the repository
 * belongs to. `orders` and `platform/orders` are names, and an image URI is
 * not one.
 */
export function requiredSimEcrRepositoryName(repositoryName: string): string {
  if (
    repositoryName.length < minimumLength ||
    repositoryName.length > maximumLength
  ) {
    throw new SimEcrInvalidParameterException(
      `Invalid parameter at 'repositoryName' failed to satisfy constraint: ` +
        `must be between ${minimumLength} and ${maximumLength} characters`,
    );
  }

  /*
   * Real ECR states the whole name as one expression: lower case letters and
   * numbers in groups separated by one period, underscore, hyphen or slash.
   * It is read here by splitting on those separators and checking the parts,
   * which says the same thing, because the single expression nests three
   * quantifiers and that is the shape a name can be written to make take
   * exponential time to match. An empty part is a name that starts, ends or
   * doubles up on a separator, which real ECR refuses too.
   */
  const parts = repositoryName.split(nameSeparators);

  if (parts.some((part) => !namePartPattern.test(part))) {
    throw new SimEcrInvalidParameterException(
      `Invalid parameter at 'repositoryName' failed to satisfy constraint: ` +
        `must be lower case letters and numbers, in groups separated by one ` +
        `period, underscore, hyphen or slash`,
    );
  }

  return repositoryName;
}
