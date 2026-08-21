import type { TerraformResource } from "./sim-tf-resource.type.js";

/**
 * The resources a template will declare, looked up by the addresses that name
 * them.
 *
 * A reference is text, and finding the resource behind it is a search over
 * addresses rather than a lookup, because the reference carries the attribute
 * being read and may leave out the instance key. Both searches are here, away
 * from the resolver deciding what to do with what they find.
 */
export class TerraformResourceAddresses {
  private readonly byAddress: ReadonlyMap<string, TerraformResource>;

  constructor(resources: readonly TerraformResource[]) {
    this.byAddress = new Map(
      resources.map((resource) => [resource.address, resource]),
    );
  }

  /**
   *
   */
  /** Every address this template will declare a Resource under. */
  public addresses(): Iterable<string> {
    return this.byAddress.keys();
  }

  /**
   *
   */
  /** The resource one address names exactly. */
  public get(address: string): TerraformResource | undefined {
    return this.byAddress.get(address);
  }

  /**
   * The resource whose address is the longest prefix of this reference.
   *
   * `aws_iam_role.processor.arn` has to find `aws_iam_role.processor` and leave
   * `arn` behind, and a `for_each` instance address carries a bracketed key
   * that is part of the address rather than an attribute.
   */
  public longestMatch(qualified: string): TerraformResource | undefined {
    let best: TerraformResource | undefined;

    for (const [address, resource] of this.byAddress) {
      if (qualified !== address && !qualified.startsWith(`${address}.`)) {
        continue;
      }

      if (best === undefined || address.length > best.address.length) {
        best = resource;
      }
    }

    return best;
  }

  /**
   * One instance of a resource a reference named without its key.
   *
   * `aws_apigatewayv2_integration.this[each.key]` is written into a plan as a
   * reference to `aws_apigatewayv2_integration.this` and a separate reference
   * to `each.key`, so the address in hand names no instance. The instance
   * meant is the one keyed like the resource doing the reading, since that is
   * what `each.key` holds there, and a resource with one instance and no key
   * to go on has only the one it could mean.
   */
  public instance(
    qualified: string,
    index: string | number | undefined,
  ): string | undefined {
    const keyed = instanceAddress(qualified, index);

    if (keyed !== undefined && this.byAddress.has(keyed)) {
      return keyed;
    }

    return this.soleInstance(qualified);
  }

  private soleInstance(qualified: string): string | undefined {
    const instances = this.byAddress
      .keys()
      .filter((address) => address.startsWith(`${qualified}[`))
      .toArray();

    return instances.length === 1 ? instances[0] : undefined;
  }
}

/** One address written with the `count` or `for_each` key of an instance. */
function instanceAddress(
  qualified: string,
  index: string | number | undefined,
): string | undefined {
  if (index === undefined) {
    return undefined;
  }

  return typeof index === "number"
    ? `${qualified}[${index}]`
    : `${qualified}["${index}"]`;
}
