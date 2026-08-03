import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimApiGatewayV2BadRequest } from "../error/sim-api-gateway-v2.error.js";
import type { SimHttpApiOpenApiPointer } from "./sim-http-api-openapi-pointer.js";
import { simHttpApiOpenApiRefusal } from "./sim-http-api-openapi-refusal.js";
import { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

interface SimHttpApiOpenApiObjectProperties {
  readonly pointer: SimHttpApiOpenApiPointer;
  readonly members: ReadonlyMap<string, JSONValue>;
}

/**
 * One object of the document being imported, and the members under it.
 *
 * Members are held as a Map rather than read off the parsed record, so a
 * document carrying a member called `constructor` or `__proto__` is read as
 * the data it is.
 */
export class SimHttpApiOpenApiObject {
  public readonly pointer: SimHttpApiOpenApiPointer;
  private readonly members: ReadonlyMap<string, JSONValue>;

  constructor(properties: SimHttpApiOpenApiObjectProperties) {
    this.pointer = properties.pointer;
    this.members = properties.members;
  }

  /**
   * The member under a name, whether or not the document carries it.
   */
  member(name: string): SimHttpApiOpenApiValue {
    return new SimHttpApiOpenApiValue({
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
  refusal(reason: string): SimApiGatewayV2BadRequest {
    return simHttpApiOpenApiRefusal(this.pointer, reason);
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
