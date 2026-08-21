import { SimPersonalizeInvalidInputException } from "../error/sim-personalize.error.js";

/**
 * The domains a Domain dataset group can be created for.
 *
 * https://docs.aws.amazon.com/personalize/latest/dg/API_CreateDatasetGroup.html
 */
export const simPersonalizeDomains = ["ECOMMERCE", "VIDEO_ON_DEMAND"] as const;

export type SimPersonalizeDomain = (typeof simPersonalizeDomains)[number];

/**
 * Read an optional domain from request input.
 *
 * A dataset group created without one is a custom dataset group, which is the
 * path AWS recommends for anything that is neither an e-commerce nor a video
 * application.
 */
export function readSimPersonalizeDomain(
  domain: string | undefined,
): SimPersonalizeDomain | undefined {
  if (domain === undefined) {
    return undefined;
  }

  const known = simPersonalizeDomains.find(
    (candidate) => candidate === domain.toUpperCase(),
  );

  if (known === undefined) {
    throw new SimPersonalizeInvalidInputException(
      `'${domain}' is not a Personalize domain. The domains are ` +
        `${simPersonalizeDomains.join(" and ")}.`,
    );
  }

  return known;
}
