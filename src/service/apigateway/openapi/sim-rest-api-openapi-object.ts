import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimApiGatewayBadRequest } from "../error/sim-api-gateway.error.js";
import type { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";
import { simRestApiOpenApiRefusal } from "./sim-rest-api-openapi-refusal.js";
import { SimRestApiOpenApiValue } from "./sim-rest-api-openapi-value.js";

interface SimRestApiOpenApiObjectProperties {
  readonly pointer: SimRestApiOpenApiPointer;
  readonly members: ReadonlyMap<string, JSONValue>;
}

/**
 * One object of the document being imported, and the members under it.
 *
 * Members are held as a Map rather than read off the parsed record, so a
 * document carrying a member called `constructor` or `__proto__` is read as
 * the data it is.
 */
export class SimRestApiOpenApiObject {
  public readonly pointer: SimRestApiOpenApiPointer;
  private readonly members: ReadonlyMap<string, JSONValue>;

  constructor(properties: SimRestApiOpenApiObjectProperties) {
    this.pointer = properties.pointer;
    this.members = properties.members;
  }

  /**
   * The member under a name, whether or not the document carries it.
   */
  member(name: string): SimRestApiOpenApiValue {
    return new SimRestApiOpenApiValue({
      pointer: this.pointer.child(name),
      value: this.members.get(name),
    });
  }

  /**
   * The names this object carries, in the order the document wrote them.
   */
  memberNames(): readonly string[] {
    return this.members.keys().toArray();
  }

  /**
   * Whether this object carries a member under a name.
   */
  has(name: string): boolean {
    return this.members.has(name);
  }

  /**
   * Refuse this object, naming where it is in the document.
   */
  refusal(reason: string): SimApiGatewayBadRequest {
    return simRestApiOpenApiRefusal(this.pointer, reason);
  }

  /**
   * Refuse a member this simulation would ignore rather than apply, with the
   * reason it is not applied.
   */
  refuseMember(name: string, reason: string): void {
    if (!this.has(name)) {
      return;
    }

    throw this.member(name).refusal(reason);
  }

  /**
   * Refuse every one of a set of members that share a reason.
   */
  refuseMembers(names: readonly string[], reason: string): void {
    for (const name of names) {
      this.refuseMember(name, reason);
    }
  }
}
