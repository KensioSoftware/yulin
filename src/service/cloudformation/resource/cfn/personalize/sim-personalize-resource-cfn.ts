import { assertDefined } from "../../../../../util/type-guard/defined.js";
import type { SimPersonalizeResource } from "../../../../personalize/resource/sim-personalize-resource.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimPersonalizeResourceCfnProperties {
  readonly resource: SimPersonalizeResource;
  readonly resourceType: string;
  readonly attributes: ReadonlyMap<string, string>;
}

/**
 * CloudFormation-facing values for a simulated Personalize resource.
 *
 * One adapter covers all five Resource types. Every one of them answers a `Ref`
 * with its name and publishes an ARN attribute, so what differs between them is
 * the attribute name and not how either value is found.
 */
export class SimPersonalizeResourceCfn implements SimCfnResourceValueAdapter {
  readonly #resource: SimPersonalizeResource;
  readonly #resourceType: string;
  readonly #attributes: ReadonlyMap<string, string>;

  constructor(properties: SimPersonalizeResourceCfnProperties) {
    this.#resource = properties.resource;
    this.#resourceType = properties.resourceType;
    this.#attributes = properties.attributes;
  }

  /**
   * Every AWS::Personalize::* Ref returns the resource name.
   *
   * The ARN is the attribute rather than the Ref, which is the way round real
   * Personalize publishes them. A template wiring one resource into another
   * therefore reads `Fn::GetAtt`, since every Personalize API takes an ARN.
   */
  refValue(): SimCfnTemplateValue {
    return this.#resource.name;
  }

  /**
   * The attributes this Resource type publishes.
   *
   * Four of the five publish their ARN and nothing else. An event tracker
   * publishes its tracking ID as well, which is the value PutEvents names.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const value = this.#attributes.get(attributeName);

    assertDefined(
      value,
      `Unsupported ${this.#resourceType} attribute ${attributeName}`,
    );

    return value;
  }
}
