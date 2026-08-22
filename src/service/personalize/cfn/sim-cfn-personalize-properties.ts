import type { SimCfnPropertyIgnorer } from "../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnPersonalizeResourceError } from "./sim-cfn-personalize-resource-error.js";

interface SimCfnPersonalizePropertiesProperties {
  readonly resourceType: string;
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;

  /** The properties this Resource type is created from. */
  readonly read: ReadonlySet<string>;

  /**
   * The real properties of this Resource type that simulated Personalize has
   * no behaviour for, and why each one is left out.
   */
  readonly unread?: ReadonlyMap<string, string> | undefined;
}

/**
 * Reads the properties of an AWS::Personalize::* Resource.
 *
 * One reader serves all five types. Every Personalize Resource property is a
 * string or a boolean handed straight to a create command, so what differs
 * between the types is which names are read and not how any of them is read.
 */
export class SimCfnPersonalizeProperties {
  readonly #resourceType: string;
  readonly #resource: SimCfnResource;
  readonly #properties: ReadonlyMap<string, SimCfnTemplateValue>;
  readonly #read: ReadonlySet<string>;
  readonly #unread: ReadonlyMap<string, string>;
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnPersonalizePropertiesProperties) {
    this.#resourceType = properties.resourceType;
    this.#resource = properties.resource;
    this.#properties = new Map(Object.entries(properties.properties));
    this.#read = properties.read;
    this.#unread = properties.unread ?? new Map();
    this.#ignorer = properties.resource;
  }

  /**
   * One string property, or nothing where the template left it out.
   *
   * A required property is left to the create command to insist on, so a
   * template and an SDK caller are refused for the same reason in the same
   * words.
   */
  string(name: string): string | undefined {
    const value = this.#properties.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.error(`${name} must be a string`);
    }

    return value;
  }

  /**
   * One boolean property, written as a boolean or as the string
   * CloudFormation carried it in.
   *
   * A boolean written literally in a template arrives as a boolean, and the
   * same boolean reaching a Resource through a String Parameter or an `Fn::Sub`
   * arrives as `"true"`.
   */
  boolean(name: string): boolean | undefined {
    const value = this.#properties.get(name);

    if (value === undefined || typeof value === "boolean") {
      return value;
    }

    if (value === "true" || value === "false") {
      return value === "true";
    }

    throw this.error(`${name} must be a boolean`);
  }

  /**
   * Record the properties the Resource is created without acting on.
   *
   * The named ones carry the reason simulated Personalize has no behaviour for
   * them. Anything else is a misspelling, or a property AWS added after this
   * was written. Real CloudFormation refuses the second one, and a stack
   * failing over a property that arrived last week is a worse way to find out.
   */
  recordUnreadProperties(): void {
    for (const name of this.#properties.keys()) {
      if (this.#read.has(name)) {
        continue;
      }

      this.#ignorer.ignoreProperty(
        name,
        this.#unread.get(name) ??
          `${name} is not a property simulated Personalize reads from ${
            this.#resourceType
          }`,
      );
    }
  }

  /** Refuse this Resource, naming it and the type it was declared as. */
  error(reason: string): Error {
    return simCfnPersonalizeResourceError(
      this.#resourceType,
      this.#resource.logicalId,
      reason,
    );
  }
}
