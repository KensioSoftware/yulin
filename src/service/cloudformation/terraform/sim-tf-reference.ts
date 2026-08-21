import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import type { TerraformResource } from "./sim-tf-plan-resources.js";
import type { TerraformModuleOutput } from "./sim-tf-module-outputs.js";
import { terraformAttributeReads } from "./sim-tf-attribute-reads.js";
import {
  longestFirst,
  moduleOutputAttribute,
  qualifiedReference,
} from "./sim-tf-reference-address.js";

/**
 * The CloudFormation logical ID standing for one Terraform address.
 *
 * A logical ID is alphanumeric, so the module path, the resource type, the name
 * and any `count` or `for_each` key are folded into one camel-run.
 *
 * Folding loses the separators, and two addresses can therefore arrive at one
 * ID. `aws_s3_bucket.foo_bar` and `aws_s3_bucket.fooBar` both give
 * `AwsS3BucketFooBar`, and so do the `for_each` keys `a-b` and `a_b`. Every
 * caller derives the ID from the address alone, so a suffix here would have to
 * be agreed between them. The template builder refuses a plan where two
 * addresses collide instead, because the alternative is one Resource silently
 * standing for two.
 */
export function terraformLogicalId(address: string): string {
  const alphanumeric = address
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return alphanumeric.length > 0 ? alphanumeric : "Resource";
}

/**
 * Resolves a Terraform reference against the resources of one plan.
 *
 * A reference is an address optionally followed by the attribute being read.
 * Terraform lists both forms for the same reference, so the longest address
 * matching a resource wins and what is left over is the attribute.
 */
export class TerraformReferenceResolver {
  private readonly byAddress: ReadonlyMap<string, TerraformResource>;
  private readonly moduleOutputs: ReadonlyMap<string, TerraformModuleOutput>;

  constructor(
    resources: readonly TerraformResource[],
    moduleOutputs: ReadonlyMap<string, TerraformModuleOutput> = new Map(),
  ) {
    this.byAddress = new Map(
      resources.map((resource) => [resource.address, resource]),
    );
    this.moduleOutputs = moduleOutputs;
  }

  /**
   * The CloudFormation value one reference stands for.
   *
   * A reference to a resource this plan does not hold returns undefined, and so
   * does one whose attribute has no entry in the read table. The caller decides
   * what an unresolvable reference means for the Resource holding it.
   */
  public resolve(
    reference: string,
    modulePath: readonly string[],
  ): SimCfnTemplateValue | undefined {
    const qualified = qualifiedReference(reference, modulePath);
    const target =
      this.longestMatch(qualified) ?? this.throughModuleOutput(qualified);

    if (target === undefined) {
      return undefined;
    }

    const attribute = qualified.startsWith(`${target.address}.`)
      ? qualified.slice(target.address.length + 1)
      : moduleOutputAttribute(qualified, this.moduleOutputs.get(qualified));
    const read =
      attribute === ""
        ? "Ref"
        : terraformAttributeReads.get(`${target.type}.${attribute}`);

    if (read === undefined) {
      return undefined;
    }

    const logicalId = terraformLogicalId(target.address);

    return read === "Ref"
      ? { Ref: logicalId }
      : { "Fn::GetAtt": [logicalId, read] };
  }

  /**
   * The address of the resource one reference names.
   *
   * A fold needs the resource a reference points at rather than the value read
   * off it, because it is merging properties into that resource's template.
   */
  public targetAddress(
    reference: string,
    modulePath: readonly string[],
  ): string | undefined {
    const qualified = qualifiedReference(reference, modulePath);

    return (this.longestMatch(qualified) ?? this.throughModuleOutput(qualified))
      ?.address;
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

    const references = longestFirst(output.references);

    for (const reference of references) {
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
