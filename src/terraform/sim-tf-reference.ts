import type { SimCfnTemplateValue } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import { terraformAttributeIntrinsic } from "./sim-tf-attribute-intrinsic.js";
import { TerraformLogicalIds } from "./sim-tf-logical-id.js";
import { TerraformResourceAddresses } from "./sim-tf-reference-addresses.js";
import { TerraformModuleOutputWalk } from "./sim-tf-module-outputs.js";
import { terraformScopeHops } from "./sim-tf-reference-scope.js";
import { qualifiedReference } from "./sim-tf-reference-address.js";

/** How far a chain of hops is followed before it is taken to be a loop. */
const hopLimit = 8;

/**
 * Resolves a Terraform reference against the resources a template declares.
 *
 * A reference is an address optionally followed by the attribute being read.
 * Terraform lists both forms for the same reference, so the longest address
 * matching a resource wins and what is left over is the attribute.
 *
 * A reference naming no address at all is followed to one that does. Module
 * outputs, module variables, `each` and an instance key left to `each.key` are
 * each recorded somewhere else in the plan, and following them is a rewrite
 * from one reference to another rather than an evaluation. Nothing here reads
 * a Terraform expression, and a value the plan marked unknown stays unknown.
 * What comes back is the resource that will produce it.
 *
 * The resources given are the ones the template will hold, rather than every
 * resource of the plan. A reference to a resource the template does not
 * declare resolves to nothing, so no property can come out of this naming a
 * logical ID that is not there.
 */
export class TerraformReferenceResolver {
  private readonly resources: TerraformResourceAddresses;
  private readonly moduleOutputs: TerraformModuleOutputWalk;
  private readonly moduleVariables: ReadonlyMap<string, readonly string[]>;
  private readonly logicalIds: TerraformLogicalIds;

  constructor(
    resources: readonly TerraformResource[],
    moduleOutputs: ReadonlyMap<string, readonly string[]> = new Map(),
    moduleVariables: ReadonlyMap<string, readonly string[]> = new Map(),
  ) {
    this.resources = new TerraformResourceAddresses(resources);
    this.moduleOutputs = new TerraformModuleOutputWalk(
      moduleOutputs,
      this.resources,
    );
    this.moduleVariables = moduleVariables;
    this.logicalIds = new TerraformLogicalIds(this.resources.addresses());
  }

  /** The logical ID the template declares one address under. */
  public logicalId(address: string): string {
    return this.logicalIds.of(address);
  }

  /**
   * The resource at one address, for a caller that needs the resource rather
   * than a value read off it. A mapping reading a name out of the resource its
   * own attribute refers to is what wants this.
   */
  public resource(address: string): TerraformResource | undefined {
    return this.resources.get(address);
  }

  /**
   * The CloudFormation value one reference stands for.
   *
   * A reference to a resource the template does not declare returns undefined,
   * and so does one whose attribute has no entry in the read table. The caller
   * decides what an unresolvable reference means for the Resource holding it.
   */
  public resolve(
    reference: string,
    from: TerraformResource,
  ): SimCfnTemplateValue | undefined {
    const qualified = this.named(reference, from.modulePath, from, 0);
    const target = qualified === undefined ? undefined : this.target(qualified);

    if (qualified === undefined || target === undefined) {
      return undefined;
    }

    return terraformAttributeIntrinsic(
      target.type,
      this.attributeName(qualified, target.address),
      this.logicalId(target.address),
    );
  }

  /**
   * The address of the resource one reference names.
   *
   * A fold needs the resource a reference points at rather than the value read
   * off it, because it is merging properties into that resource's template,
   * and so does the ordering pass.
   */
  public targetAddress(
    reference: string,
    from: TerraformResource,
  ): string | undefined {
    const qualified = this.named(reference, from.modulePath, from, 0);

    return qualified === undefined
      ? undefined
      : this.target(qualified)?.address;
  }

  /**
   * The same reference, written so that it names a resource of this plan.
   *
   * A reference that already names one is itself. One that names an instance
   * without its key gains the key. One under a scope the plan resolves for
   * itself is replaced by what was written where that scope was set, and then
   * asked again.
   */
  private named(
    reference: string,
    modulePath: readonly string[],
    from: TerraformResource,
    depth: number,
  ): string | undefined {
    const qualified = qualifiedReference(reference, modulePath);

    if (this.target(qualified) !== undefined) {
      return qualified;
    }

    const keyed = this.resources.instance(qualified, from.index);

    if (keyed !== undefined) {
      return keyed;
    }

    return depth >= hopLimit
      ? undefined
      : this.throughScope(reference, modulePath, from, depth);
  }

  /**
   * The one resource a scoped reference leads to, where there is only one.
   *
   * A plan records the references of a whole collection as one list and says
   * nothing about which part of it a reader was reading, so a collection built
   * out of two resources cannot say which of them `each.value.uri` holds.
   * Guessing there would put a plausible logical ID into a property that names
   * the wrong resource, which is worse than the property being absent. Two
   * answers is therefore no answer, and the resource is left out and reported
   * the way it is today.
   */
  private throughScope(
    reference: string,
    modulePath: readonly string[],
    from: TerraformResource,
    depth: number,
  ): string | undefined {
    const hops = terraformScopeHops(
      reference,
      modulePath,
      from,
      this.moduleVariables,
      depth,
    );
    const found = new Map<string, string>();

    for (const hop of hops) {
      const named = this.named(hop.reference, hop.modulePath, from, depth + 1);
      const address =
        named === undefined ? undefined : this.target(named)?.address;

      if (named !== undefined && address !== undefined && !found.has(address)) {
        found.set(address, named);
      }
    }

    return found.size === 1 ? found.values().next().value : undefined;
  }

  /**
   * The attribute a reference reads off the resource behind it.
   *
   * A reference naming a resource address and nothing else names no attribute,
   * and is the resource itself. A reference through a module output names the
   * output rather than the attribute, and the output's own expression says
   * which attribute that is.
   */
  private attributeName(
    qualified: string,
    address: string,
  ): string | undefined {
    if (qualified === address) {
      return undefined;
    }

    return qualified.startsWith(`${address}.`)
      ? qualified.slice(address.length + 1)
      : this.moduleOutputs.attributeOf(qualified);
  }

  private target(qualified: string): TerraformResource | undefined {
    return (
      this.resources.longestMatch(qualified) ??
      this.moduleOutputs.target(qualified)
    );
  }
}
