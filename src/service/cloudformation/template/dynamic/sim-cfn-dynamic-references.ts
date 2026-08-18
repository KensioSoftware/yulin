import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnPropertyIgnorer } from "../../resource/ignore/sim-cfn-ignored-property.type.js";
import { currentSimCfnValuePath } from "../value/sim-cfn-value-path.js";
import { simCfnDynamicReferenceResolvers } from "./sim-cfn-dynamic-reference-resolvers.js";
import { substituteSimCfnDynamicReferences } from "./sim-cfn-dynamic-reference-scan.js";
import type { SimCfnDynamicReferenceResolver } from "./sim-cfn-dynamic-reference.type.js";

interface SimCfnDynamicReferencesProperties {
  readonly resolvers: ReadonlyMap<string, SimCfnDynamicReferenceResolver>;
  readonly propertyIgnorer?: SimCfnPropertyIgnorer | undefined;
}

/**
 * The services a Stack's dynamic references are answered by.
 *
 * This sits on the resolve context so that a string node can substitute what
 * it holds without knowing which simulated services exist. A service with no
 * resolver here leaves its references in the template as written, which is
 * what the ones this simulation has yet to implement do.
 */
export class SimCfnDynamicReferences {
  private readonly resolvers: ReadonlyMap<
    string,
    SimCfnDynamicReferenceResolver
  >;

  private readonly propertyIgnorer: SimCfnPropertyIgnorer | undefined;

  constructor(properties: SimCfnDynamicReferencesProperties) {
    this.resolvers = properties.resolvers;
    this.propertyIgnorer = properties.propertyIgnorer;
  }

  /**
   * Replace every dynamic reference in a resolved string.
   *
   * A reference answered with a stand-in value is recorded against the
   * property it sat on, so the Resource reports it the same way it reports a
   * property its service could not act on.
   */
  substitute(text: string): string {
    return substituteSimCfnDynamicReferences(text, (reference) => {
      const resolver = this.resolvers.get(reference.service);

      if (resolver === undefined) {
        return;
      }

      const resolution = resolver.resolve(reference);

      if (resolution.reason !== undefined) {
        this.propertyIgnorer?.ignoreProperty(
          currentSimCfnValuePath(),
          resolution.reason,
        );
      }

      return resolution.value;
    });
  }
}

interface MakeSimCfnDynamicReferencesProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly propertyIgnorer?: SimCfnPropertyIgnorer | undefined;
}

/**
 * Build the dynamic reference resolvers for one Account and Region scope.
 */
export function makeSimCfnDynamicReferences(
  properties: MakeSimCfnDynamicReferencesProperties,
): SimCfnDynamicReferences {
  const { simAws, accountRegionScope, propertyIgnorer } = properties;

  const scopedAws = simAws.accountRegionScope(
    accountRegionScope.accountId,
    accountRegionScope.regionName,
  );

  return new SimCfnDynamicReferences({
    propertyIgnorer,
    resolvers: new Map(
      simCfnDynamicReferenceResolvers
        .entries()
        .map(([service, resolver]) => [service, resolver(scopedAws)]),
    ),
  });
}
