import type { SimCfnTemplateValue } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import type { TerraformModuleOutput } from "./sim-tf-module-outputs.js";
import { terraformAttributeReads } from "./sim-tf-attribute-reads.js";
import { TerraformLogicalIds } from "./sim-tf-logical-id.js";
import {
  longestFirst,
  qualifiedReference,
} from "./sim-tf-reference-address.js";

/**
 * Resolves a Terraform reference against the resources a template declares.
 *
 * A reference is an address optionally followed by the attribute being read.
 * Terraform lists both forms for the same reference, so the longest address
 * matching a resource wins and what is left over is the attribute.
 *
 * The resources given are the ones the template will hold, rather than every
 * resource of the plan. A reference to a resource the template does not
 * declare resolves to nothing, so no property can come out of this naming a
 * logical ID that is not there.
 */
export class TerraformReferenceResolver {
  private readonly byAddress: ReadonlyMap<string, TerraformResource>;
  private readonly moduleOutputs: ReadonlyMap<string, TerraformModuleOutput>;
  private readonly logicalIds: TerraformLogicalIds;

  constructor(
    resources: readonly TerraformResource[],
    moduleOutputs: ReadonlyMap<string, TerraformModuleOutput> = new Map(),
  ) {
    this.byAddress = new Map(
      resources.map((resource) => [resource.address, resource]),
    );
    this.moduleOutputs = moduleOutputs;
    this.logicalIds = new TerraformLogicalIds(this.byAddress.keys());
  }

  /** The logical ID the template declares one address under. */
  public logicalId(address: string): string {
    return this.logicalIds.of(address);
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
    modulePath: readonly string[],
  ): SimCfnTemplateValue | undefined {
    const qualified = qualifiedReference(reference, modulePath);
    const target = this.target(qualified);

    if (target === undefined) {
      return undefined;
    }

    const attribute = this.attributeName(qualified, target.address);
    const read =
      attribute === undefined
        ? "Ref"
        : terraformAttributeReads.get(`${target.type}.${attribute}`);

    if (read === undefined) {
      return undefined;
    }

    const logicalId = this.logicalId(target.address);

    return read === "Ref"
      ? { Ref: logicalId }
      : { "Fn::GetAtt": [logicalId, read] };
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
    modulePath: readonly string[],
  ): string | undefined {
    return this.target(qualifiedReference(reference, modulePath))?.address;
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

    if (qualified.startsWith(`${address}.`)) {
      return qualified.slice(address.length + 1);
    }

    const output = this.moduleOutputs.get(qualified);
    const [longest] = longestFirst(output?.references ?? []);

    return longest?.split(".").pop();
  }

  private target(qualified: string): TerraformResource | undefined {
    return this.longestMatch(qualified) ?? this.throughModuleOutput(qualified);
  }

  /**
   * The resource a module output leads to.
   *
   * The output's own expression names it, in terms of the module declaring the
   * output, so following one is resolving that expression again one module
   * down. An output built out of several resources returns the first that
   * resolves, and the depth limit stops a module whose outputs refer to each
   * other from looping.
   */
  private throughModuleOutput(
    qualified: string,
    depth = 0,
  ): TerraformResource | undefined {
    const output = this.moduleOutputs.get(qualified);

    if (output === undefined || depth > 8) {
      return undefined;
    }

    for (const reference of longestFirst(output.references)) {
      const nested = qualifiedReference(reference, output.modulePath);
      const target =
        this.longestMatch(nested) ??
        this.throughModuleOutput(nested, depth + 1);

      if (target !== undefined) {
        return target;
      }
    }

    return undefined;
  }

  /**
   * The resource whose address is the longest prefix of this reference.
   *
   * `aws_iam_role.processor.arn` has to find `aws_iam_role.processor` and leave
   * `arn` behind, and a `for_each` instance address carries a bracketed key
   * that is part of the address rather than an attribute.
   */
  private longestMatch(qualified: string): TerraformResource | undefined {
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
}
