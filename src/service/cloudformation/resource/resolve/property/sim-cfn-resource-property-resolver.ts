import { SimCfnParameters } from "../../../parameters/sim-cfn-parameters.js";
import { SimCfnTemplateValueResolver } from "../../../template/value/sim-cfn-template-value-resolver.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceResolveContext } from "../../sim-cfn-resource.type.js";
import type { SimCfnPseudoParameters } from "../../../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import type { SimCfnExports } from "../../../export/sim-cfn-exports.js";
import type { SimAwsAccountRegionScope } from "../../../../aws/sim-aws-account-region-scope.js";
import {
  makeSimCfnDynamicReferences,
  type SimCfnDynamicReferences,
} from "../../../template/dynamic/sim-cfn-dynamic-references.js";
import type { SimCfnPropertyIgnorer } from "../../ignore/sim-cfn-ignored-property.type.js";

interface SimCfnResourcePropertyResolverProperties {
  readonly parameters?: SimCfnParameters | undefined;
  readonly pseudoParameters?: SimCfnPseudoParameters | undefined;
  readonly exports?: SimCfnExports | undefined;
  readonly accountRegionScope?: SimAwsAccountRegionScope | undefined;
  readonly propertyIgnorer?: SimCfnPropertyIgnorer | undefined;
}

/**
 * Resolves CloudFormation Resource Properties immediately before Resource
 * creation.
 *
 * This is the Resource-level resolution pass. It runs after stack dependencies
 * have been evaluated and just before the service-specific Resource factory is
 * called, so Refs to already-created Resources can be converted to those
 * Resources' CloudFormation Ref values.
 *
 * Template-wide validation and early Parameter handling happen elsewhere. This
 * class only adapts the current Resource creation context into the shape needed
 * by SimCfnTemplateValueResolver.
 */
export class SimCfnResourcePropertyResolver {
  private readonly parameters: SimCfnParameters | undefined;
  private readonly pseudoParameters: SimCfnPseudoParameters | undefined;
  private readonly exports: SimCfnExports | undefined;
  private readonly accountRegionScope: SimAwsAccountRegionScope | undefined;
  private readonly propertyIgnorer: SimCfnPropertyIgnorer | undefined;

  constructor(properties: SimCfnResourcePropertyResolverProperties = {}) {
    this.parameters = properties.parameters;
    this.pseudoParameters = properties.pseudoParameters;
    this.exports = properties.exports;
    this.accountRegionScope = properties.accountRegionScope;
    this.propertyIgnorer = properties.propertyIgnorer;
  }

  /**
   * Resolve the Resource Properties object for service-specific creation.
   *
   * Parameters and Resource Refs are resolved through
   * {@link SimCfnTemplateValueResolver}. If no Parameters are available, an empty
   * Parameter resolver is used so Resource Refs can still resolve.
   *
   * Resource Refs are read from the creation context. If a referenced Resource
   * is unexpectedly absent, the Ref is preserved as `{ Ref: logicalId }` rather
   * than being converted to an invalid value.
   */
  resolve(
    properties: SimCfnTemplateValueRecord,
    context: SimCfnResourceResolveContext,
  ): SimCfnTemplateValueRecord {
    const resolver = new SimCfnTemplateValueResolver({
      parameters: this.parameters ?? new SimCfnParameters(),
      pseudoParameters: this.pseudoParameters,
      exports: this.exports,
      dynamicReferences: this.dynamicReferences(context),
      resources: {
        has: (id): boolean => context.resources.has(id),
        refValue: (id): SimCfnTemplateValue => {
          const dependency = context.resources.get(id);

          /* v8 ignore if -- defensive catch for inconsistent context */
          if (dependency === undefined) {
            return { Ref: id };
          }

          return dependency.refValue;
        },
        attributeValue: (id, attributeName): SimCfnTemplateValue => {
          const dependency = context.resources.get(id);

          /* v8 ignore if -- defensive catch for inconsistent context */
          if (dependency === undefined) {
            return { "Fn::GetAtt": [id, attributeName] };
          }

          return dependency.attributeValue(attributeName);
        },
      },
    });

    return resolver.resolveRecord(properties);
  }

  /**
   * The services answering this Resource's dynamic references.
   *
   * Absent where the caller has no simulation to read from, which is how the
   * resolver is used on its own in tests. A reference then stays in the
   * property as the template wrote it.
   */
  private dynamicReferences(
    context: SimCfnResourceResolveContext,
  ): SimCfnDynamicReferences | undefined {
    const { simAws } = context;

    if (simAws === undefined || this.accountRegionScope === undefined) {
      return undefined;
    }

    return makeSimCfnDynamicReferences({
      simAws,
      accountRegionScope: this.accountRegionScope,
      propertyIgnorer: this.propertyIgnorer,
    });
  }
}
