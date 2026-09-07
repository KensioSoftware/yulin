import { isRecord } from "../../../util/type-guard/record.js";

/**
 * Convert one attribute value, in whichever direction is being applied.
 */
export type SimDynamoDbDocumentConversion = (
  value: unknown,
  path: string,
) => unknown;

/**
 * Where in a document Command's input or output the attribute values sit.
 *
 * A document Command carries native values at some of its fields and ordinary
 * request values at the rest, so a conversion cannot simply walk the whole
 * request. This is the same shape the real document client describes those
 * places with, and each Command states its own.
 */
export interface SimDynamoDbDocumentPath {
  /**
   * Answer with a copy of a value, converted at the places this path names.
   */
  convert(
    value: unknown,
    conversion: SimDynamoDbDocumentConversion,
    path: string,
  ): unknown;
}

/**
 * Every attribute value of an item, a key or a set of expression values.
 *
 * An attribute whose value is undefined is left out rather than converted, and
 * that happens whatever the document client was built with. The real client
 * drops it in the same place: `removeUndefinedValues` governs the values
 * inside an attribute, and an item is not itself one of them.
 */
class SimDynamoDbDocumentValuesPath implements SimDynamoDbDocumentPath {
  convert(
    value: unknown,
    conversion: SimDynamoDbDocumentConversion,
    path: string,
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((member, index) =>
        conversion(member, `${path}[${index.toString()}]`),
      );
    }

    if (!isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, member]) => member !== undefined)
        .map(([name, member]) => [name, conversion(member, `${path}.${name}`)]),
    );
  }
}

/**
 * Every member of a record or a list, each read through the same path.
 */
class SimDynamoDbDocumentEachPath implements SimDynamoDbDocumentPath {
  private readonly member: SimDynamoDbDocumentPath;

  constructor(member: SimDynamoDbDocumentPath) {
    this.member = member;
  }

  convert(
    value: unknown,
    conversion: SimDynamoDbDocumentConversion,
    path: string,
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((member, index) =>
        this.member.convert(member, conversion, `${path}[${index.toString()}]`),
      );
    }

    if (!isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([name, member]) => [
        name,
        this.member.convert(member, conversion, `${path}.${name}`),
      ]),
    );
  }
}

/**
 * Named fields of a record, with everything else carried through untouched.
 *
 * A field the request left out is left out, rather than added as an empty one,
 * so a Command reaches the simulated service with the fields it was given.
 */
class SimDynamoDbDocumentFieldsPath implements SimDynamoDbDocumentPath {
  private readonly fields: ReadonlyMap<string, SimDynamoDbDocumentPath>;

  constructor(fields: Readonly<Record<string, SimDynamoDbDocumentPath>>) {
    this.fields = new Map(Object.entries(fields));
  }

  convert(
    value: unknown,
    conversion: SimDynamoDbDocumentConversion,
    path: string,
  ): unknown {
    if (!isRecord(value)) {
      return value;
    }

    const converted: Record<string, unknown> = { ...value };

    for (const [name, field] of this.fields) {
      // oxlint-disable-next-line security/detect-object-injection -- a field name this path declares, not one the request chose.
      const member = value[name];

      if (member !== undefined) {
        // oxlint-disable-next-line security/detect-object-injection -- the same declared field name.
        converted[name] = field.convert(member, conversion, `${path}.${name}`);
      }
    }

    return converted;
  }
}

/**
 * A path to a record or list whose every member is one attribute value, which
 * is what an Item, a Key and a set of expression values are.
 */
export function simDynamoDbDocumentValues(): SimDynamoDbDocumentPath {
  return new SimDynamoDbDocumentValuesPath();
}

/**
 * A path through every member of a record or list.
 */
export function simDynamoDbDocumentEach(
  member: SimDynamoDbDocumentPath,
): SimDynamoDbDocumentPath {
  return new SimDynamoDbDocumentEachPath(member);
}

/**
 * A path through named fields of a record.
 */
export function simDynamoDbDocumentFields(
  fields: Readonly<Record<string, SimDynamoDbDocumentPath>>,
): SimDynamoDbDocumentPath {
  return new SimDynamoDbDocumentFieldsPath(fields);
}
