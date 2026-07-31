import { simDynamoDbBinaryText } from "./sim-dynamodb-binary.js";
import type { SimDynamoDbNumber } from "./sim-dynamodb-number.js";
import type {
  SimDynamoDbBinarySetValue,
  SimDynamoDbNumberSetValue,
  SimDynamoDbStringSetValue,
  SimDynamoDbValue,
} from "./sim-dynamodb-value.js";

/**
 * A stored value that is one of the three set kinds.
 */
export type SimDynamoDbSetValue =
  | SimDynamoDbStringSetValue
  | SimDynamoDbNumberSetValue
  | SimDynamoDbBinarySetValue;

/**
 * Two sets of the same kind, and the members each of them holds.
 *
 * Set arithmetic only makes sense between two sets of one kind, so the pair is
 * made once and carries its members already narrowed. That is what lets the
 * arithmetic below hold no doubt about what it is working on.
 */
export type SimDynamoDbSetPair =
  | {
      readonly kind: "SS";
      readonly stored: readonly string[];
      readonly other: readonly string[];
    }
  | {
      readonly kind: "NS";
      readonly stored: readonly SimDynamoDbNumber[];
      readonly other: readonly SimDynamoDbNumber[];
    }
  | {
      readonly kind: "BS";
      readonly stored: readonly Uint8Array[];
      readonly other: readonly Uint8Array[];
    };

/**
 * The descriptors a set arrives under.
 */
const kindsOfSet: ReadonlySet<string> = new Set(["SS", "NS", "BS"]);

/**
 * Whether a stored value is a set.
 */
export function isSimDynamoDbSet(
  value: SimDynamoDbValue,
): value is SimDynamoDbSetValue {
  return kindsOfSet.has(value.kind);
}

/**
 * Pair two sets up, or answer with nothing when they are not the same kind.
 *
 * Real DynamoDB refuses to add a string set to a number set, so nothing here
 * has to decide what that would mean.
 */
export function simDynamoDbMatchingSets(
  stored: SimDynamoDbSetValue,
  other: SimDynamoDbSetValue,
): SimDynamoDbSetPair | undefined {
  if (stored.kind === "SS" && other.kind === "SS") {
    return { kind: "SS", stored: stored.texts, other: other.texts };
  }

  if (stored.kind === "NS" && other.kind === "NS") {
    return { kind: "NS", stored: stored.numbers, other: other.numbers };
  }

  if (stored.kind === "BS" && other.kind === "BS") {
    return { kind: "BS", stored: stored.bytes, other: other.bytes };
  }

  return undefined;
}

/**
 * One set with the members of another added to it.
 *
 * Membership goes by value rather than by identity, so a member the set already
 * holds is not added twice. The members it had keep the order they arrived in
 * and the new ones follow, which is as good an order as any for a set real
 * DynamoDB holds unordered.
 */
export function simDynamoDbSetUnion(
  pair: SimDynamoDbSetPair,
): SimDynamoDbSetValue {
  if (pair.kind === "SS") {
    return { kind: "SS", texts: united(pair.stored, pair.other, textKey) };
  }

  if (pair.kind === "NS") {
    return { kind: "NS", numbers: united(pair.stored, pair.other, numberKey) };
  }

  return {
    kind: "BS",
    bytes: united(pair.stored, pair.other, simDynamoDbBinaryText),
  };
}

/**
 * One set with the members of another taken out of it, or nothing when that
 * leaves no members at all.
 *
 * DynamoDB has no empty set, so a subtraction that empties one takes the
 * attribute away with it.
 */
export function simDynamoDbSetDifference(
  pair: SimDynamoDbSetPair,
): SimDynamoDbSetValue | undefined {
  const kept = remaining(pair);

  if (memberCount(kept) === 0) {
    return undefined;
  }

  return kept;
}

/**
 * The set left when one set's members are taken out of another's.
 */
function remaining(pair: SimDynamoDbSetPair): SimDynamoDbSetValue {
  if (pair.kind === "SS") {
    return { kind: "SS", texts: without(pair.stored, pair.other, textKey) };
  }

  if (pair.kind === "NS") {
    return { kind: "NS", numbers: without(pair.stored, pair.other, numberKey) };
  }

  return {
    kind: "BS",
    bytes: without(pair.stored, pair.other, simDynamoDbBinaryText),
  };
}

/**
 * How many members a set holds.
 */
function memberCount(value: SimDynamoDbSetValue): number {
  if (value.kind === "SS") {
    return value.texts.length;
  }

  if (value.kind === "NS") {
    return value.numbers.length;
  }

  return value.bytes.length;
}

/**
 * The members of one set, and the members of another it did not already hold.
 */
function united<Member>(
  stored: readonly Member[],
  other: readonly Member[],
  keyOf: (member: Member) => string,
): readonly Member[] {
  const held = new Set(stored.map((member) => keyOf(member)));

  return [...stored, ...other.filter((member) => !held.has(keyOf(member)))];
}

/**
 * The members of one set that another does not hold.
 */
function without<Member>(
  stored: readonly Member[],
  other: readonly Member[],
  keyOf: (member: Member) => string,
): readonly Member[] {
  const taken = new Set(other.map((member) => keyOf(member)));

  return stored.filter((member) => !taken.has(keyOf(member)));
}

/**
 * A string member keys by itself.
 */
function textKey(text: string): string {
  return text;
}

/**
 * A number member keys by its normalised digits, so `1` and `1.0` are one
 * member.
 */
function numberKey(number: SimDynamoDbNumber): string {
  return number.text;
}
