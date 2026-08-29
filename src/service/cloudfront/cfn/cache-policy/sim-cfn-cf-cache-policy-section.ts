import { isRecord } from "../../../../util/type-guard/record.js";
import {
  simCfCacheKeyCookieBehaviors,
  simCfCacheKeyHeaderBehaviors,
  simCfCacheKeyQueryStringBehaviors,
} from "../../cache-policy/sim-cf-cache-key.js";

export type SimCfnCfCachePolicyRefuse = (detail: string) => never;

export interface SimCfnCfCacheKeySectionSpec<TBehavior extends string> {
  readonly section: string;
  readonly behaviorField: string;
  readonly itemsField: string;
  readonly behaviors: readonly TBehavior[];
  readonly defaultBehavior: TBehavior;
}

/**
 * The three sections of a cache key, each with the fields CloudFormation
 * names it by and the behaviours CloudFront offers for it.
 */
export const simCfnCfCookiesSpec = {
  section: "CookiesConfig",
  behaviorField: "CookieBehavior",
  itemsField: "Cookies",
  behaviors: simCfCacheKeyCookieBehaviors,
  defaultBehavior: "none",
} as const;

export const simCfnCfHeadersSpec = {
  section: "HeadersConfig",
  behaviorField: "HeaderBehavior",
  itemsField: "Headers",
  behaviors: simCfCacheKeyHeaderBehaviors,
  defaultBehavior: "none",
} as const;

export const simCfnCfQueryStringsSpec = {
  section: "QueryStringsConfig",
  behaviorField: "QueryStringBehavior",
  itemsField: "QueryStrings",
  behaviors: simCfCacheKeyQueryStringBehaviors,
  defaultBehavior: "none",
} as const;

/**
 * One `<name>Config` section of a cache key, as the behaviour it names and the
 * names that behaviour applies to.
 *
 * An absent section is CloudFront's `none` with an empty list, and so is a
 * section that named no behaviour of its own. A behaviour outside the set
 * CloudFront offers for the section is refused.
 */
export function simCfnCfCacheKeySection<TBehavior extends string>(
  parameters: Record<string, unknown>,
  spec: SimCfnCfCacheKeySectionSpec<TBehavior>,
  refuse: SimCfnCfCachePolicyRefuse,
): { behavior: TBehavior; items: readonly string[] } {
  // oxlint-disable-next-line security/detect-object-injection
  const section = parameters[spec.section];

  if (section === undefined) {
    return { behavior: spec.defaultBehavior, items: [] };
  }

  if (!isRecord(section)) {
    return refuse(`${spec.section} must be an object`);
  }

  return {
    // oxlint-disable-next-line security/detect-object-injection
    behavior: behaviorNamed(section[spec.behaviorField], spec, refuse),
    items: namesListed(section, spec, refuse),
  };
}

/**
 * The behaviour a section named, refused where CloudFront does not offer it
 * for that section.
 */
function behaviorNamed<TBehavior extends string>(
  named: unknown,
  spec: SimCfnCfCacheKeySectionSpec<TBehavior>,
  refuse: SimCfnCfCachePolicyRefuse,
): TBehavior {
  if (named === undefined) {
    return spec.defaultBehavior;
  }

  const offered: readonly string[] = spec.behaviors;

  return typeof named === "string" && offered.includes(named)
    ? (named as TBehavior)
    : refuse(
        `${spec.section} ${spec.behaviorField} must be one of ${offered.join(", ")}`,
      );
}

/**
 * The names a section lists, which a `whitelist` keys on and an `allExcept`
 * keys on everything but.
 */
function namesListed(
  section: Record<string, unknown>,
  spec: SimCfnCfCacheKeySectionSpec<string>,
  refuse: SimCfnCfCachePolicyRefuse,
): readonly string[] {
  // oxlint-disable-next-line security/detect-object-injection
  const listed = section[spec.itemsField];

  if (listed === undefined) {
    return [];
  }

  return Array.isArray(listed) &&
    listed.every((name) => typeof name === "string")
    ? listed
    : refuse(`${spec.section} ${spec.itemsField} must be a list of strings`);
}
