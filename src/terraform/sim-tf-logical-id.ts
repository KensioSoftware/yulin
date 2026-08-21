/**
 * The CloudFormation logical IDs standing for the addresses of one plan.
 *
 * A logical ID is alphanumeric, so the module path, the resource type, the
 * name and any `count` or `for_each` key are folded into one camel-run.
 * Folding loses the separators, and two addresses can therefore arrive at the
 * same run. `aws_s3_bucket.foo_bar` and `aws_s3_bucket.fooBar` both give
 * `AwsS3BucketFooBar`, and so do the `for_each` keys `a-b` and `a_b`.
 *
 * The addresses of a plan are named together rather than one at a time, so a
 * collision can be given a number instead of refusing the plan. Addresses are
 * sorted before they are named, so which of a colliding pair keeps the plain
 * ID is decided by the plan rather than by the order the resources were read
 * in.
 */
export class TerraformLogicalIds {
  private readonly byAddress: ReadonlyMap<string, string>;

  constructor(addresses: Iterable<string>) {
    this.byAddress = namedAddresses([...addresses].toSorted(byCodeUnit));
  }

  /**
   * The logical ID standing for one address.
   *
   * An address this was not built with is named as though it stood alone,
   * which is what a caller asking about a resource outside the template wants.
   */
  public of(address: string): string {
    return this.byAddress.get(address) ?? camelRun(address);
  }
}

/**
 * Address order by code unit, over addresses that are already distinct.
 *
 * Which of a colliding pair keeps the plain logical ID follows from this, so
 * it has to be the same everywhere. `localeCompare` orders by the collation
 * rules of whatever locale the process is running under, and a template whose
 * logical IDs move with the machine is one a test cannot name a Resource in.
 */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : 1;
}

function namedAddresses(addresses: readonly string[]): Map<string, string> {
  const groups = new Map<string, string[]>();

  for (const address of addresses) {
    const base = camelRun(address);

    groups.set(base, [...(groups.get(base) ?? []), address]);
  }

  const taken = new Set(groups.keys());
  const named = new Map<string, string>();

  for (const [base, group] of groups) {
    for (const [position, address] of group.entries()) {
      named.set(address, position === 0 ? base : numbered(base, taken));
    }
  }

  return named;
}

/**
 * The next free numbered form of a logical ID.
 *
 * Numbering starts at two, so the first of a colliding group keeps the name
 * the address gives and the second reads as the second of that name. The
 * search steps past a number already taken, since a numbered ID can collide
 * with one an address arrived at on its own.
 */
function numbered(base: string, taken: Set<string>): string {
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}${suffix}`;

    if (!taken.has(candidate)) {
      taken.add(candidate);

      return candidate;
    }
  }
}

/** One address as a single alphanumeric camel-run. */
function camelRun(address: string): string {
  const alphanumeric = address
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return alphanumeric.length > 0 ? alphanumeric : "Resource";
}
