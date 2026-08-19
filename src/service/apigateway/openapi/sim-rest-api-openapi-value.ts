import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimApiGatewayBadRequest } from "../error/sim-api-gateway.error.js";
import { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";
import type { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";
import { simRestApiOpenApiRefusal } from "./sim-rest-api-openapi-refusal.js";

interface SimRestApiOpenApiValueProperties {
  readonly pointer: SimRestApiOpenApiPointer;
  readonly value: JSONValue | undefined;
}

const missing = "is required, and the document does not carry it";

/**
 * One value of the document being imported, at the pointer that reaches it.
 *
 * A document arrives as whatever JSON held, so every read narrows a value and
 * refuses the shapes it cannot be. Nothing here knows what any member means:
 * that is the readers above, which is what keeps the narrowing in one place
 * and the meaning in classes named after the thing they read.
 */
export class SimRestApiOpenApiValue {
  public readonly pointer: SimRestApiOpenApiPointer;
  private readonly value: JSONValue | undefined;

  constructor(properties: SimRestApiOpenApiValueProperties) {
    this.pointer = properties.pointer;
    this.value = properties.value;
  }

  /**
   * Whether the document leaves this member out.
   */
  absent(): boolean {
    return this.value === undefined;
  }

  /**
   * Refuse this member, naming where it is in the document.
   */
  refusal(reason: string): SimApiGatewayBadRequest {
    return simRestApiOpenApiRefusal(this.pointer, reason);
  }

  /**
   * This value as an object, refusing a document that left it out.
   */
  object(): SimRestApiOpenApiObject {
    const object = this.optionalObject();

    if (object === undefined) {
      throw this.refusal(missing);
    }

    return object;
  }

  /**
   * This value as an object when the document carries one.
   */
  optionalObject(): SimRestApiOpenApiObject | undefined {
    if (this.value === undefined) {
      return undefined;
    }

    if (
      typeof this.value !== "object" ||
      this.value === null ||
      Array.isArray(this.value)
    ) {
      throw this.refusal("has to be an object");
    }

    return new SimRestApiOpenApiObject({
      pointer: this.pointer,
      members: new Map(Object.entries(this.value)),
    });
  }

  /**
   * This value as a string, refusing a document that left it out.
   */
  requiredString(): string {
    const text = this.optionalString();

    if (text === undefined || text.length === 0) {
      throw this.refusal(missing);
    }

    return text;
  }

  /**
   * This value as a string when the document carries one.
   */
  optionalString(): string | undefined {
    if (this.value === undefined) {
      return undefined;
    }

    if (typeof this.value !== "string") {
      throw this.refusal("has to be a string");
    }

    return this.value;
  }

  /**
   * The entries of this value as an array, when the document carries one.
   */
  optionalArray(): readonly SimRestApiOpenApiValue[] | undefined {
    if (this.value === undefined) {
      return undefined;
    }

    if (!Array.isArray(this.value)) {
      throw this.refusal("has to be an array");
    }

    return this.value.map(
      (entry, index) =>
        new SimRestApiOpenApiValue({
          pointer: this.pointer.child(String(index)),
          value: entry,
        }),
    );
  }
}
