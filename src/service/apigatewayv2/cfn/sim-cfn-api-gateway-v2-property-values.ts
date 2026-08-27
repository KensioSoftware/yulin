import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnApiGatewayV2ScalarValues } from "./sim-cfn-api-gateway-v2-scalar-values.js";

/**
 * Reads the value shapes an AWS::ApiGatewayV2::* property can take.
 *
 * This is the half of property validation about what a value is, as
 * SimCfnApiGatewayV2PropertyParser is the half about which properties may
 * appear at all. A template value arrives as whatever JSON held, and a
 * property carrying the wrong shape is refused here rather than reaching a
 * command as something it cannot use.
 *
 * The lists and objects are here, and the single values each entry of one has
 * to be are `SimCfnApiGatewayV2ScalarValues` below.
 */
export class SimCfnApiGatewayV2PropertyValues extends SimCfnApiGatewayV2ScalarValues {
  /**
   * Parse a property value that must be a list of strings when present, which
   * is the shape a route's `AuthorizationScopes` and an authorizer's
   * `IdentitySource` take.
   */
  optionalStringList(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, "a list of strings");
    }

    return value.map((entry, index) =>
      this.requiredString(resource, entry, `${label}[${String(index)}]`),
    );
  }

  /**
   * Parse a property value that must be a list of objects when present, which
   * is the shape a domain name's `DomainNameConfigurations` takes.
   */
  optionalRecordList(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): SimCfnTemplateValueRecord[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, "a list of objects");
    }

    return value.map((entry, index) =>
      this.requiredRecord(resource, entry, `${label}[${String(index)}]`),
    );
  }

  /**
   * Parse a property value that must be an object, which is what one entry of
   * a list of objects has to be.
   */
  requiredRecord(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): SimCfnTemplateValueRecord {
    const record = this.optionalRecord(resource, value, label);

    if (record === undefined) {
      throw this.invalidPropertyError(resource, label, "an object");
    }

    return record;
  }

  /**
   * Parse a property value that must be a record of further properties when
   * present, which is the shape an authorizer's `JwtConfiguration` takes.
   */
  optionalRecord(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
    expected = "an object",
  ): SimCfnTemplateValueRecord | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, expected);
    }

    return value;
  }

  /**
   * Parse a property value that must be an object of strings when present,
   * which is the shape a stage's `StageVariables` takes.
   */
  optionalStringMap(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): Record<string, string> | undefined {
    const record = this.optionalRecord(
      resource,
      value,
      label,
      "an object of strings",
    );

    if (record === undefined) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(record).map(([name, entry]) => [
        name,
        this.requiredString(resource, entry, `${label}.${name}`),
      ]),
    );
  }
}
