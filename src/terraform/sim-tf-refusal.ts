import type { TerraformResource } from "./sim-tf-resource.type.js";
import type { TerraformBuildContext } from "./sim-tf-attributes.js";
import { terraformResourceMappings } from "./sim-tf-registry.js";
import type {
  TerraformDeclaration,
  TerraformMappedResource,
} from "./sim-tf-mapping.type.js";
import type { TerraformSkipReason } from "./sim-tf-report.type.js";

/**
 * Why the Resource a mapping builds is one the service would not accept.
 *
 * A plan can leave a value the service requires unresolvable, and a Resource
 * built without it fails and takes the Stack's other Resources with it. The
 * mapping names those properties under `requires`, and names under `refused`
 * the case where every property is there and the service will not take one of
 * the values. Either way the resource is left out of the template rather than
 * deployed into a failure.
 */
export function terraformRefusal(
  declaration: TerraformDeclaration,
  build: TerraformBuildContext,
  unresolved: TerraformSkipReason,
): TerraformSkipReason | undefined {
  const built = builtResource(declaration, build);

  if (built.refused !== undefined) {
    return built.refused;
  }

  return missing(built).length === 0 ? undefined : unresolved;
}

/**
 * The properties a mapping declares as required and could not fill.
 *
 * A resource with no mapping at all has none. It is refused for the type
 * before any value is read, and there is no mapping to ask what it needed.
 */
export function terraformMissingProperties(
  resource: TerraformResource,
  build: TerraformBuildContext,
): readonly string[] {
  const mapping = terraformResourceMappings.get(resource.type);

  return mapping === undefined
    ? []
    : missing(builtResource({ resource, mapping }, build));
}

/** The Resource one declaration's mapping builds, against this plan. */
function builtResource(
  declaration: TerraformDeclaration,
  build: TerraformBuildContext,
): TerraformMappedResource {
  return declaration.mapping({
    resource: declaration.resource,
    resolver: build.resolver,
    overrides: build.overrides,
  });
}

function missing(built: TerraformMappedResource): readonly string[] {
  return (built.requires ?? []).filter(
    // oxlint-disable-next-line security/detect-object-injection
    (name) => built.Properties[name] === undefined,
  );
}
