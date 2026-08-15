import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnEcsApiShape } from "./sim-cfn-ecs-api-shape.js";
import { simCfnEcsPropertyError } from "./sim-cfn-ecs-property-error.js";

interface SimCfnEcsPropertyReaderProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads the property shapes an ECS Resource template can hold.
 *
 * A template is written by hand as often as it is synthesized, so a property
 * of the wrong shape is refused naming both the property and the Resource
 * rather than being coerced into something that would deploy.
 *
 * The `api` readers do the same and then translate what they read into the
 * spelling the ECS API uses, which is what a task definition and a cluster are
 * mostly made of.
 */
export class SimCfnEcsPropertyReader {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnEcsPropertyReaderProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
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
   * A property that is a whole number, where the template declared one.
   *
   * A template may write a count as a number or as the text of one, since a
   * String Parameter resolves to text whatever it holds, and CloudFormation
   * takes either. Anything else is refused rather than counted as zero, a
   * fraction included: what these properties count is tasks, and there is no
   * half of one to keep running.
   */
  wholeNumber(name: string): number | undefined {
    const value = this.declared(name);

    if (value === undefined) {
      return undefined;
    }

    const declared = simCfnEcsWholeNumber(value);

    if (declared === undefined) {
      throw this.refuse(`${name} is a whole number`);
    }

    return declared;
  }

  /**
   * A property that is a list of strings, where the template declared one.
   */
  textList(name: string): readonly string[] | undefined {
    return this.list(name)?.map((entry, index) => {
      if (typeof entry !== "string") {
        throw this.refuse(`${name} entry ${String(index)} is a string`);
      }

      return entry;
    });
  }

  /**
   * A property that is a list, where the template declared one.
   */
  list(name: string): readonly SimCfnTemplateValue[] | undefined {
    const value = this.declared(name);

    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.refuse(`${name} is a list`);
    }

    return value;
  }

  /**
   * A property that is an object, where the template declared one.
   */
  record(name: string): Record<string, unknown> | undefined {
    const value = this.declared(name);

    if (value === undefined) {
      return undefined;
    }

    if (!isRecord(value)) {
      throw this.refuse(`${name} is an object`);
    }

    return value;
  }

  /**
   * A declared list, in the spelling the ECS API uses.
   */
  apiList<T>(name: string): readonly T[] | undefined {
    return simCfnEcsApiShape(this.list(name)) as readonly T[] | undefined;
  }

  /**
   * A declared object, in the spelling the ECS API uses.
   */
  apiRecord<T>(name: string): T | undefined {
    return simCfnEcsApiShape(this.record(name)) as T | undefined;
  }

  /**
   * A refusal naming this Resource.
   */
  refuse(reason: string): Error {
    return simCfnEcsPropertyError(this.resource.logicalId, reason);
  }

  /**
   * The value the template wrote for a property, whatever shape it is.
   *
   * The name always comes from this service's own fixed list of the properties
   * an ECS Resource has, never from the template.
   */
  private declared(name: string): SimCfnTemplateValue | undefined {
    // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
    return this.properties[name];
  }
}

/**
 * A declared value read as a whole number, or nothing where it is not one.
 *
 * The text of a number counts, since a String Parameter resolves to text
 * whatever it holds. A fraction does not, and neither does a whole number too
 * large to be held exactly, which would count something other than what the
 * template wrote.
 */
function simCfnEcsWholeNumber(value: SimCfnTemplateValue): number | undefined {
  const declared = simCfnEcsDeclaredNumber(value);

  if (declared === undefined || !Number.isSafeInteger(declared)) {
    return undefined;
  }

  return declared;
}

/**
 * A declared value read as a number, however the template wrote it.
 *
 * Text is read only where it is digits, so an empty string and a hexadecimal
 * literal are not numbers here, whatever `Number` would make of them.
 */
function simCfnEcsDeclaredNumber(
  value: SimCfnTemplateValue,
): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/u.test(value)) {
    return Number(value);
  }

  return undefined;
}
