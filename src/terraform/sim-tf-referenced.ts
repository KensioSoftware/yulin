/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../util/type-guard/record.js";
import type { TerraformExpression } from "./sim-tf-plan.type.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import type { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { longestFirst } from "./sim-tf-reference-address.js";

/**
 * The resource one attribute of a resource refers to.
 *
 * A fold reads the resource it configures this way, because its parent
 * attribute holds a reference rather than a value. A bucket or a role being
 * created by the same plan has no name until it exists, so the reference is
 * all there is to go on.
 *
 * Terraform lists both the attribute form and the bare resource form of one
 * reference, and both lead to the same resource, so the first that resolves
 * wins.
 */
export function terraformReferencedResource(
  resource: TerraformResource,
  key: string,
  resolver: TerraformReferenceResolver,
): TerraformResource | undefined {
  const address = terraformReferencedAddress(resource, key, resolver);

  return address === undefined ? undefined : resolver.resource(address);
}

/** The address of the resource one attribute refers to. */
export function terraformReferencedAddress(
  resource: TerraformResource,
  key: string,
  resolver: TerraformReferenceResolver,
): string | undefined {
  const expression = resource.expressions[key];

  if (!isRecord(expression)) {
    return undefined;
  }

  const references = longestFirst(
    (expression as TerraformExpression).references ?? [],
  );

  for (const reference of references) {
    const address = resolver.targetAddress(reference, resource.modulePath);

    if (address !== undefined) {
      return address;
    }
  }

  return undefined;
}
