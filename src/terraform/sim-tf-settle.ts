import type { TerraformPlan } from "./sim-tf-plan.type.js";
import {
  terraformAwsProvider,
  type TerraformResource,
} from "./sim-tf-resource.type.js";
import { terraformModuleOutputs } from "./sim-tf-module-outputs.js";
import { TerraformReferenceResolver } from "./sim-tf-reference.js";
import {
  terraformResourceFolds,
  terraformResourceMappings,
} from "./sim-tf-registry.js";
import type { TerraformResourceMapping } from "./sim-tf-mapping.type.js";
import type { TerraformSkipReason } from "./sim-tf-report.type.js";

/** One resource of a plan, with the mapping that will build its Resource. */
export interface TerraformDeclaration {
  readonly resource: TerraformResource;
  readonly mapping: TerraformResourceMapping;
}

/**
 * Which resources of a plan the template will declare, and what resolves
 * against them.
 */
export interface TerraformSettledPlan {
  /** The resources a Resource is built for, in plan order. */
  readonly declared: readonly TerraformDeclaration[];
  /** A resolver that knows those resources and no others. */
  readonly resolver: TerraformReferenceResolver;
  /** Why a resource is not one of them, by address. */
  readonly refused: ReadonlyMap<string, TerraformSkipReason>;
}

/**
 * Settle which resources of a plan become CloudFormation Resources.
 *
 * Whether a resource can be built depends on what its references resolve to,
 * and what a reference resolves to depends on which resources are being built.
 * The two are decided together before anything is built. Each round drops the
 * resources whose required properties the round's resolver cannot fill, and a
 * resource dropped is one the next round's references no longer reach. The set
 * only ever shrinks, and the rounds therefore end.
 *
 * Building against the settled set is then a single pass that produces nothing
 * it has to take back. No Resource is built and then removed, and no property
 * is left naming a logical ID the template does not declare.
 */
export function settledTerraformPlan(
  plan: TerraformPlan,
  resources: readonly TerraformResource[],
): TerraformSettledPlan {
  const moduleOutputs = terraformModuleOutputs(plan);
  const refused = new Map<string, TerraformSkipReason>();

  let candidates = resources.flatMap((resource) => mappable(resource, refused));
  let reason: TerraformSkipReason = "unresolved required attribute";

  for (;;) {
    const resolver = new TerraformReferenceResolver(
      candidates.map((declaration) => declaration.resource),
      moduleOutputs,
    );
    const kept = candidates.filter((declaration) =>
      buildable(declaration, resolver),
    );

    if (kept.length === candidates.length) {
      return { declared: kept, resolver, refused };
    }

    const keptAddresses = new Set(
      kept.map((declaration) => declaration.resource.address),
    );

    for (const { resource } of candidates) {
      if (!keptAddresses.has(resource.address)) {
        refused.set(resource.address, reason);
      }
    }

    candidates = kept;
    // A resource that was buildable a round ago and is not now lost the
    // resource it was reading, rather than never having had one.
    reason = "references a resource that was skipped";
  }
}

/**
 * The mapping a resource will be built with, if this import has one for it.
 *
 * A folding resource comes back with none and without a reason recorded, since
 * the fold pass is what decides whether it reached the resource it configures.
 */
function mappable(
  resource: TerraformResource,
  refused: Map<string, TerraformSkipReason>,
): readonly TerraformDeclaration[] {
  if (resource.provider !== terraformAwsProvider) {
    refused.set(resource.address, "not an AWS provider resource");

    return [];
  }

  const mapping = terraformResourceMappings.get(resource.type);

  if (mapping !== undefined) {
    return [{ resource, mapping }];
  }

  if (!terraformResourceFolds.has(resource.type)) {
    refused.set(resource.address, "no mapping for resource type");
  }

  return [];
}

/**
 * Whether the Resource this mapping builds is one a service would accept.
 *
 * A plan can leave a value the service requires unresolvable, and a Resource
 * built without it fails and takes the Stack's other Resources with it. The
 * mapping names those properties, and a resource missing one is left out of
 * the template rather than deployed into a failure.
 */
function buildable(
  declaration: TerraformDeclaration,
  resolver: TerraformReferenceResolver,
): boolean {
  return missingProperties(declaration, resolver).length === 0;
}

/**
 * The properties a mapping declares as required and could not fill.
 *
 * A resource with no mapping at all has none. It is refused for the type
 * before any value is read, and there is no mapping to ask what it needed.
 */
export function terraformMissingProperties(
  resource: TerraformResource,
  resolver: TerraformReferenceResolver,
): readonly string[] {
  const mapping = terraformResourceMappings.get(resource.type);

  return mapping === undefined
    ? []
    : missingProperties({ resource, mapping }, resolver);
}

function missingProperties(
  declaration: TerraformDeclaration,
  resolver: TerraformReferenceResolver,
): readonly string[] {
  const built = declaration.mapping({
    resource: declaration.resource,
    resolver,
  });

  return (built.requires ?? []).filter(
    // oxlint-disable-next-line security/detect-object-injection
    (name) => built.Properties[name] === undefined,
  );
}
