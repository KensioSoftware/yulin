import { createHash } from "node:crypto";
import { SimSqsMessageAttribute } from "./sim-sqs-message-attribute.js";
import type {
  SimSqsMessageAttributeInput,
  SimSqsMessageAttributeValue,
} from "./sim-sqs-message-attribute-value.js";

const everyAttributeSelectors = new Set(["All", ".*"]);

const prefixSelectorSuffix = ".*";

/**
 * The message attributes of one message.
 *
 * Attributes are digested and reported as a set rather than one at a time,
 * because both are properties of the set: the digest covers the attributes in
 * name order, and a receive request selects a subset of them.
 */
export class SimSqsMessageAttributes {
  private readonly attributes: readonly SimSqsMessageAttribute[];

  private constructor(attributes: readonly SimSqsMessageAttribute[]) {
    this.attributes = attributes;
  }

  /**
   * Read the message attributes of a request, refusing any real SQS would
   * refuse.
   */
  static of(
    input: SimSqsMessageAttributeInput | undefined,
  ): SimSqsMessageAttributes {
    const attributes = Object.entries(input ?? {})
      .filter(
        (entry): entry is [string, SimSqsMessageAttributeValue] =>
          entry[1] !== undefined,
      )
      .map(([name, value]) => SimSqsMessageAttribute.of(name, value));

    return new this(attributes);
  }

  /**
   * Whether there are no attributes here, in which case SQS reports neither the
   * attributes nor their digest.
   */
  get isEmpty(): boolean {
    return this.attributes.length === 0;
  }

  /**
   * The MD5 digest of these attributes, as SQS reports it.
   */
  digest(): string {
    const digested = Buffer.concat(
      this.attributes
        .toSorted((one, other) => one.name.localeCompare(other.name))
        .map((attribute) => attribute.digestBytes()),
    );

    return createHash("md5").update(digested).digest("hex");
  }

  /**
   * These attributes as SQS reports them in a response.
   */
  reported(): Record<string, SimSqsMessageAttributeValue> {
    return Object.fromEntries(
      this.attributes.map((attribute) => [
        attribute.name,
        attribute.reported(),
      ]),
    );
  }

  /**
   * The attributes a receive request asked for.
   *
   * Real SQS returns no message attributes unless they are named, so a consumer
   * that forgot to ask for them gets none here too. `All` and `.*` select every
   * attribute, a bare name selects that one, and a name ending in `.*` selects
   * every attribute with that prefix.
   */
  selected(names: readonly string[] | undefined): SimSqsMessageAttributes {
    if (names === undefined || names.length === 0) {
      return new SimSqsMessageAttributes([]);
    }

    if (names.some((name) => everyAttributeSelectors.has(name))) {
      return this;
    }

    return new SimSqsMessageAttributes(
      this.attributes.filter((attribute) =>
        names.some((name) => selects(name, attribute.name)),
      ),
    );
  }
}

/**
 * Whether one requested attribute name selects an attribute.
 */
function selects(requested: string, attributeName: string): boolean {
  if (requested.endsWith(prefixSelectorSuffix)) {
    return attributeName.startsWith(
      requested.slice(0, -prefixSelectorSuffix.length),
    );
  }

  return requested === attributeName;
}
