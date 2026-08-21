import { SimPersonalizeInvalidInputException } from "../error/sim-personalize.error.js";

/**
 * The name pattern every Personalize resource shares.
 *
 * https://docs.aws.amazon.com/personalize/latest/dg/API_CreateDatasetGroup.html
 */
const namePattern = /^[A-Za-z\d][\w-]*$/;

const maximumNameLength = 63;

/**
 * Read a resource name from request input, refusing one real Personalize would
 * refuse.
 *
 * The field name is passed in so the message names the field the caller
 * actually supplied, which is `name` on every create and reads better than a
 * generic mention of a resource.
 */
export function requireSimPersonalizeName(
  name: string | undefined,
  resourceDescription: string,
): string {
  if (name === undefined || name === "") {
    throw new SimPersonalizeInvalidInputException(
      `A ${resourceDescription} needs a name`,
    );
  }

  if (name.length > maximumNameLength) {
    throw new SimPersonalizeInvalidInputException(
      `'${name}' is too long for a ${resourceDescription} name. Personalize ` +
        `allows up to ${maximumNameLength} characters.`,
    );
  }

  if (!namePattern.test(name)) {
    throw new SimPersonalizeInvalidInputException(
      `'${name}' is not a valid ${resourceDescription} name. Personalize ` +
        `names start with a letter or a digit and carry only letters, ` +
        `digits, hyphens and underscores.`,
    );
  }

  return name;
}
