import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnElbV2DeclaredResource } from "./sim-cfn-elbv2-declared-resource.js";
import { simCfnElbV2PropertyError } from "./sim-cfn-elbv2-property-error.js";

/**
 * Reads the property shapes an ELBv2 Resource template can hold.
 *
 * CloudFormation spells every ELBv2 property the way the API spells it, so
 * nothing here translates names. What it does is check that a declared value
 * is the shape the property takes, and refuse one that is not, naming the
 * Resource and the property rather than letting the ELBv2 command refuse
 * something it cannot say where came from.
 *
 * A list of structures is read as a list of objects and handed on unchanged,
 * so a listener's actions and a rule's conditions reach the same model an SDK
 * caller's would.
 */
export class SimCfnElbV2PropertyReader {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(declared: SimCfnElbV2DeclaredResource) {
    this.resource = declared.resource;
    this.properties = declared.properties;
  }

  /**
   * A property that is a string, where the template declared one.
   */
  text(name: string): string | undefined {
    const value = this.declared(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.refuse(`${name} is a string`);
    }

    return value;
  }

  /**
   * A property that is a number, where the template declared one.
   *
   * CloudFormation carries a number as a string when it came from a template
   * Parameter, so a numeric string reads as the number it spells.
   */
  number(name: string): number | undefined {
    const value = this.declared(name);

    if (value === undefined) {
      return undefined;
    }

    const parsed = readSimCfnElbV2Number(value);

    if (parsed === undefined) {
      throw this.refuse(`${name} is a number`);
    }

    return parsed;
  }

  /**
   * A property that is a boolean, where the template declared one.
   */
  boolean(name: string): boolean | undefined {
    const value = this.declared(name);

    if (value === undefined) {
      return undefined;
    }

    if (value === true || value === "true") {
      return true;
    }

    if (value === false || value === "false") {
      return false;
    }

    throw this.refuse(`${name} is a boolean`);
  }

  /**
   * A property that is a list of structures, where the template declared one.
   *
   * The entries are handed on in the shape the template wrote them, which is
   * the shape the ELBv2 command takes, so a declared action or condition is
   * read by the same code an SDK caller's is.
   */
  structures<T>(name: string): readonly T[] | undefined {
    const value = this.declared(name);

    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.refuse(`${name} is a list`);
    }

    return value.map((entry, index) => {
      if (!isRecord(entry)) {
        throw this.refuse(`${name} entry ${String(index)} is an object`);
      }

      return entry as T;
    });
  }

  /**
   * A property that is a structure, where the template declared one.
   */
  structure<T>(name: string): T | undefined {
    const value = this.declared(name);

    if (value === undefined) {
      return undefined;
    }

    if (!isRecord(value)) {
      throw this.refuse(`${name} is an object`);
    }

    return value as T;
  }

  /**
   * A refusal naming this Resource.
   */
  refuse(reason: string): Error {
    return simCfnElbV2PropertyError(this.resource.logicalId, reason);
  }

  /**
   * The value the template wrote for a property, whatever shape it is.
   *
   * The name always comes from this service's own fixed list of the properties
   * an ELBv2 Resource has, never from the template.
   */
  private declared(name: string): SimCfnTemplateValue | undefined {
    // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
    return this.properties[name];
  }
}

/**
 * Read a template value as a number, or as nothing when it is not one.
 */
function readSimCfnElbV2Number(value: SimCfnTemplateValue): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}
