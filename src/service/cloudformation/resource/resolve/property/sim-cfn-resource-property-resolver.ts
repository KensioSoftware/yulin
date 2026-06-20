import type { SimCfnParameters } from "../../../parameters/sim-cfn-parameters.js";
import { SimCfnTemplateValueResolver } from "../../../template/value/sim-cfn-template-value-resolver.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCloudFormationResourceCreateContext } from "../../sim-cfn-resource.js";

interface SimCfnResourcePropertyResolverProps {
  readonly parameters?: SimCfnParameters | undefined;
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

  constructor(props: SimCfnResourcePropertyResolverProps = {}) {
    this.parameters = props.parameters;
  }

  /**
   * Resolve the Resource Properties object for service-specific creation.
   *
   * If no Parameters are available, the raw Properties object is returned
   * because there is no late Resource-level substitution to perform. Otherwise,
   * Parameters and Resource Refs are resolved through
   * {@link SimCfnTemplateValueResolver}.
   *
   * Resource Refs are read from the creation context. If a referenced Resource
   * is unexpectedly absent, the Ref is preserved as `{ Ref: logicalId }` rather
   * than being converted to an invalid value.
   */
  resolve(
    properties: SimCfnTemplateValueRecord,
    context: SimCloudFormationResourceCreateContext,
  ): SimCfnTemplateValueRecord {
    if (this.parameters === undefined) {
      return properties;
    }

    const resolver = new SimCfnTemplateValueResolver({
      parameters: this.parameters,
      resources: {
        has: (id): boolean => context.resources.has(id),
        refValue: (id): string | { Ref: string } => {
          const dependency = context.resources.get(id);

          /* v8 ignore if -- defensive catch for inconsistent context */
          if (dependency === undefined) {
            return { Ref: id };
          }

          return dependency.refValue;
        },
      },
    });

    return resolver.resolveRecord(properties);
  }
}
