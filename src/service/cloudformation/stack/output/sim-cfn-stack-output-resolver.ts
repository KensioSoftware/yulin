import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import { SimCfnTemplateValueResolver } from "../../template/value/sim-cfn-template-value-resolver.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import type { SimCfnStackOutput } from "./sim-cfn-stack-output.js";

interface SimCfnStackOutputResolverProps {
  readonly template: SimCfnTemplate;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
}

/**
 * Resolves CloudFormation Outputs after Stack Resources have been created.
 *
 * Outputs can reference Resources via the same intrinsic functions supported by
 * Resource properties, so this class adapts the Stack Resource map into the
 * template value resolver's Resource resolver shape.
 */
export class SimCfnStackOutputResolver {
  private readonly template: SimCfnTemplate;
  private readonly resources: ReadonlyMap<string, SimCfnResource>;

  constructor(props: SimCfnStackOutputResolverProps) {
    this.template = props.template;
    this.resources = props.resources;
  }

  /**
   * Resolve all Stack Outputs.
   */
  resolve(): Map<string, SimCfnStackOutput> {
    return new Map(
      this.template.outputTemplates().map((outputTemplate) => {
        const resolvedTemplate = this.resolveOutputTemplate(
          outputTemplate.template,
        );

        return [
          outputTemplate.outputKey,
          {
            outputKey: outputTemplate.outputKey,
            value: this.value(outputTemplate.outputKey, resolvedTemplate),
            description: this.description(resolvedTemplate),
            exportName: this.exportName(resolvedTemplate),
          },
        ];
      }),
    );
  }

  private value(
    outputKey: string,
    template: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValue {
    const value = template["Value"];

    if (value === undefined) {
      throw new TypeError(
        `Sim CloudFormation Output ${outputKey} must have a Value`,
      );
    }

    return value;
  }

  private resolveOutputTemplate(
    template: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValueRecord {
    return new SimCfnTemplateValueResolver({
      parameters: this.template.parameters,
      resources: {
        has: (id): boolean => this.resources.has(id),
        refValue: (id): SimCfnTemplateValue => {
          const resource = this.resources.get(id);

          /* v8 ignore if -- defensive catch for inconsistent context */
          if (resource === undefined) {
            return { Ref: id };
          }

          return resource.refValue;
        },
        attributeValue: (id, attributeName): SimCfnTemplateValue => {
          const resource = this.resources.get(id);

          /* v8 ignore if -- defensive catch for inconsistent context */
          if (resource === undefined) {
            return { "Fn::GetAtt": [id, attributeName] };
          }

          return resource.attributeValue(attributeName);
        },
      },
    }).resolveRecord(template);
  }

  private description(template: SimCfnTemplateValueRecord): string | undefined {
    const description = template["Description"];

    return typeof description === "string" ? description : undefined;
  }

  private exportName(
    template: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValue | undefined {
    const exportValue = template["Export"];

    if (
      typeof exportValue === "object" &&
      exportValue !== null &&
      !Array.isArray(exportValue) &&
      "Name" in exportValue
    ) {
      return exportValue["Name"];
    }

    return undefined;
  }
}
