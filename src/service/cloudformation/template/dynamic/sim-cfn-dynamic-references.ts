import type { SimCfnPropertyIgnorer } from "../../resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../value/sim-cfn-template-value.js";
import { currentSimCfnValuePath } from "../value/sim-cfn-value-path.js";
import { SimCfnAwaitedDynamicReferences } from "./sim-cfn-awaited-dynamic-references.js";
import { fillSimCfnDynamicReferencePlaceholders } from "./sim-cfn-dynamic-reference-placeholder.js";
import { substituteSimCfnDynamicReferences } from "./sim-cfn-dynamic-reference-scan.js";
import type {
  SimCfnDynamicReferenceResolution,
  SimCfnDynamicReferenceResolver,
} from "./sim-cfn-dynamic-reference.type.js";

interface SimCfnDynamicReferencesProperties {
  readonly resolvers: ReadonlyMap<string, SimCfnDynamicReferenceResolver>;
  readonly propertyIgnorer?: SimCfnPropertyIgnorer | undefined;

  /**
   * The type of the Resource whose properties are being resolved, which a
   * service restricting where its references may be written needs.
   */
  readonly resourceType?: string | undefined;
}

/**
 * The services a Stack's dynamic references are answered by.
 *
 * This sits on the resolve context so that a string node can substitute what
 * it holds without knowing which simulated services exist. A service with no
 * resolver here leaves its references in the template as written, which is
 * what the ones this simulation has yet to implement do.
 *
 * One of these belongs to a single Resource's property resolution. That is
 * what lets it hold the references still being read. `substitute` runs while
 * the properties resolve, and `settle` finishes them afterwards.
 */
export class SimCfnDynamicReferences {
  private readonly resolvers: ReadonlyMap<
    string,
    SimCfnDynamicReferenceResolver
  >;

  private readonly propertyIgnorer: SimCfnPropertyIgnorer | undefined;

  private readonly resourceType: string | undefined;

  private readonly awaited = new SimCfnAwaitedDynamicReferences();

  constructor(properties: SimCfnDynamicReferencesProperties) {
    this.resolvers = properties.resolvers;
    this.propertyIgnorer = properties.propertyIgnorer;
    this.resourceType = properties.resourceType;
  }

  /**
   * Replace every dynamic reference in a resolved string.
   *
   * A service answering at once is substituted here. One answering with a
   * promise leaves a marker behind for `settle` to replace, so that resolution
   * stays synchronous around a service that has to be waited on.
   */
  substitute(text: string): string {
    return substituteSimCfnDynamicReferences(text, (reference) => {
      const resolver = this.resolvers.get(reference.service);

      if (resolver === undefined) {
        return;
      }

      const path = currentSimCfnValuePath();
      const resolution = resolver.resolve(reference, {
        resourceType: this.resourceType,
        propertyPath: path,
      });

      if (resolution instanceof Promise) {
        return this.awaited.hold(resolution, path);
      }

      return this.answer(resolution, path);
    });
  }

  /**
   * Finish the references a service had to be waited on to answer.
   *
   * The resolved properties are handed back with every marker replaced. They
   * come back untouched where nothing was waited on, which is every Resource
   * whose properties name only services answering at once.
   */
  async settle(
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimCfnTemplateValueRecord> {
    if (this.awaited.isEmpty) {
      return properties;
    }

    const settled = await this.awaited.settled();

    const values = new Map(
      settled.map((reference) => [
        reference.placeholder,
        this.answer(reference.resolution, reference.path),
      ]),
    );

    return fillSimCfnDynamicReferencePlaceholders(properties, values);
  }

  /**
   * The value one reference resolved to.
   *
   * A reference answered with a stand-in value is recorded against the
   * property it sat on, so the Resource reports it the same way it reports a
   * property its service could not act on.
   */
  private answer(
    resolution: SimCfnDynamicReferenceResolution,
    path: string,
  ): string {
    if (resolution.reason !== undefined) {
      this.propertyIgnorer?.ignoreProperty(path, resolution.reason);
    }

    return resolution.value;
  }
}
