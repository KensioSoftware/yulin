/* eslint-disable security/detect-object-injection -- every lookup here is a
   claim name this simulation asks for, such as `iss` or `exp`, read out of a
   plain object that JSON.parse produced. */

/**
 * One value a JWT claim can hold, which is whatever JSON can hold.
 */
export type SimJwtClaimValue =
  | string
  | number
  | boolean
  | null
  | readonly SimJwtClaimValue[]
  | { readonly [name: string]: SimJwtClaimValue };

/**
 * The claim set of one JWT, as it was signed.
 */
export type SimJwtClaimRecord = Readonly<Record<string, SimJwtClaimValue>>;

/**
 * Whether a claim holds a list, narrowed to the element type rather than to
 * the `any[]` Array.isArray gives on its own.
 */
export function isSimJwtClaimList(
  value: SimJwtClaimValue | undefined,
): value is readonly SimJwtClaimValue[] {
  return Array.isArray(value);
}

/**
 * The payload of a JWT, read by claim name.
 *
 * A claim is whatever the issuer put there, so every accessor here answers
 * undefined for a claim that is absent and for one holding something other
 * than the type asked for. That keeps the checks a verifier makes uniform: a
 * missing `exp` and an `exp` holding a string both fail the same way, rather
 * than one failing and the other throwing.
 */
export class SimJwtClaims {
  private readonly values: SimJwtClaimRecord;

  constructor(values: SimJwtClaimRecord) {
    this.values = values;
  }

  /**
   * Whether the token carries this claim at all, whatever it holds.
   */
  has(name: string): boolean {
    return this.values[name] !== undefined;
  }

  /**
   * A claim holding a string.
   */
  text(name: string): string | undefined {
    const value = this.values[name];

    return typeof value === "string" ? value : undefined;
  }

  /**
   * A claim holding a number, which is how the time claims are carried.
   */
  number(name: string): number | undefined {
    const value = this.values[name];

    return typeof value === "number" ? value : undefined;
  }

  /**
   * A claim holding either one string or a list of them, as `aud` does.
   *
   * A list with anything but strings in it answers undefined rather than the
   * strings it happens to hold, since a claim that shape was not written by an
   * issuer this understands.
   */
  textList(name: string): readonly string[] | undefined {
    const value = this.values[name];

    if (typeof value === "string") {
      return [value];
    }

    if (!isSimJwtClaimList(value)) {
      return undefined;
    }

    const strings: string[] = [];

    for (const entry of value) {
      if (typeof entry !== "string") {
        return undefined;
      }

      strings.push(entry);
    }

    return strings;
  }

  /**
   * Every claim, for a consumer that passes the whole set on rather than
   * asking for one.
   */
  toRecord(): SimJwtClaimRecord {
    return this.values;
  }
}
