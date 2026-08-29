import { isRecord } from "../../../../util/type-guard/record.js";

export type SimCfnCfPolicyRefuse = (detail: string) => never;

export interface SimCfnCfPolicySectionSpec<TBehavior extends string> {
  readonly section: string;
  readonly behaviorField: string;
  readonly itemsField: string;
  readonly behaviors: readonly TBehavior[];
  readonly defaultBehavior: TBehavior;
}

/**
 * One `<name>Config` section of a cache policy or an origin request policy, as
 * the behaviour it names and the names that behaviour applies to.
 *
 * The two policy kinds write these sections the same way, down to the field
 * names, and differ only in the behaviours each section offers. An absent
 * section is CloudFront's `none` with an empty list, and so is a section that
 * named no behaviour of its own. A behaviour outside the set CloudFront offers
 * for the section is refused.
 */
export function simCfnCfPolicySection<TBehavior extends string>(
  parameters: Record<string, unknown>,
  spec: SimCfnCfPolicySectionSpec<TBehavior>,
  refuse: SimCfnCfPolicyRefuse,
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
  spec: SimCfnCfPolicySectionSpec<TBehavior>,
  refuse: SimCfnCfPolicyRefuse,
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
 * The names a section lists, which a `whitelist` applies to and an `allExcept`
 * applies to everything but.
 */
function namesListed(
  section: Record<string, unknown>,
  spec: SimCfnCfPolicySectionSpec<string>,
  refuse: SimCfnCfPolicyRefuse,
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
