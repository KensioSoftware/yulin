import { isRecord } from "../../util/type-guard/record.js";
import {
  simSdkWireJsonServices,
  type SimSdkWireJsonShape,
} from "./sim-sdk-wire-json-shapes.js";

/**
 * Turns the members of a parsed AWS JSON protocol body that JSON cannot carry
 * back into the values the Command input held.
 *
 * Blobs travel as base64 text and timestamps as epoch seconds, and only the
 * operation's schema says which members those are. This reads them from a
 * snapshot of the SDK client schemas.
 *
 * In the snapshot's notation, a member kind is `blob`, `timestamp`,
 * `list:<kind>`, `map:<kind>` or `#<Shape>`, the last naming another entry in
 * the same service's shapes.
 */
export class SimSdkWireJsonDecoder {
  private readonly shapes: ReadonlyMap<string, SimSdkWireJsonShape>;

  private constructor(shapes: ReadonlyMap<string, SimSdkWireJsonShape>) {
    this.shapes = shapes;
  }

  /**
   * Decode the input of one operation. An operation whose input holds no blob
   * and no timestamp is returned as it was parsed.
   */
  static decodeInput(
    serviceId: string,
    operationName: string,
    input: unknown,
  ): unknown {
    const service = simSdkWireJsonServices.get(serviceId);
    const inputShape = service?.operations.get(operationName);
    if (service === undefined || inputShape === undefined) {
      return input;
    }

    return new SimSdkWireJsonDecoder(service.shapes).decode(
      `#${inputShape}`,
      input,
    );
  }

  /**
   * Decode a value of the given kind.
   *
   * A value that does not have the wire form its kind calls for is left as it
   * is. No SDK sends one, and passing it on leaves the simulated operation to
   * refuse it the way it refuses any other malformed input.
   */
  private decode(kind: string, value: unknown): unknown {
    if (kind === "blob") {
      return decodeBlob(value);
    }
    if (kind === "timestamp") {
      return decodeTimestamp(value);
    }
    if (kind.startsWith("list:")) {
      return this.decodeList(kind.slice("list:".length), value);
    }
    if (kind.startsWith("map:")) {
      return this.decodeMap(kind.slice("map:".length), value);
    }

    return this.decodeStructure(kind.slice(1), value);
  }

  private decodeList(elementKind: string, value: unknown): unknown {
    if (!Array.isArray(value)) {
      return value;
    }

    return value.map((element: unknown) => this.decode(elementKind, element));
  }

  private decodeMap(valueKind: string, value: unknown): unknown {
    if (!isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, member]) => [
        key,
        this.decode(valueKind, member),
      ]),
    );
  }

  private decodeStructure(shapeName: string, value: unknown): unknown {
    const shape = this.shapes.get(shapeName);
    if (shape === undefined || !isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([name, member]) => [
        name,
        this.decodeMember(shape, name, member),
      ]),
    );
  }

  private decodeMember(
    shape: SimSdkWireJsonShape,
    name: string,
    member: unknown,
  ): unknown {
    const memberKind = shape.get(name);
    if (memberKind === undefined) {
      return member;
    }

    return this.decode(memberKind, member);
  }
}

/**
 * A blob member travels as base64 text.
 */
function decodeBlob(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return new Uint8Array(Buffer.from(value, "base64"));
}

/**
 * A timestamp member travels as epoch seconds, with a fraction for
 * milliseconds. A member whose schema names another format travels as the
 * date string that format gives, which Date reads either way.
 */
function decodeTimestamp(value: unknown): unknown {
  if (typeof value === "number") {
    return new Date(value * 1000);
  }
  if (typeof value === "string") {
    return new Date(value);
  }

  return value;
}
