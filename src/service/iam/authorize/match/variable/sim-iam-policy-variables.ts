import type { SimIamConditionValue } from "../../../policy/sim-iam-policy.js";
import {
  simIamLiteralAsterisk,
  simIamLiteralQuestionMark,
} from "../../sim-iam-wildcard.js";

/**
 * How a policy value with variables in it is read once they are replaced.
 *
 * `text` is compared as it stands, as `StringEquals` compares it. `pattern` is
 * a wildcard pattern, as `StringLike`, the ARN operators and `Resource` read
 * one. A `*` or `?` that came from a variable is then marked as literal, so
 * `${*}` and a value carrying an asterisk match an asterisk and nothing else.
 */
export type SimIamVariableMode = "text" | "pattern";

/**
 * The number of colons before the resource part of an ARN, which is the only
 * part of a `Resource` that variables are replaced in.
 */
const resourcePartColon = 5;

/**
 * The fixed variables AWS provides for characters that otherwise have a
 * special meaning.
 */
const specialCharacters = new Map([
  ["*", { text: "*", pattern: simIamLiteralAsterisk }],
  ["?", { text: "?", pattern: simIamLiteralQuestionMark }],
  ["$", { text: "$", pattern: "$" }],
]);

/**
 * Replaces the policy variables in a policy value, such as
 * `${aws:username}` or `${aws:PrincipalTag/team, 'company-wide'}`, with values
 * from the request's condition context.
 *
 * A variable names a single-valued context key, without regard to case. A key
 * the request carries no value for, or carries a list for, has no value. The
 * default after the comma stands in for it where the policy gives one.
 * Otherwise the whole policy value has no value, and `resolve` answers
 * undefined.
 *
 * `${` with no closing brace is left as literal text.
 */
export class SimIamPolicyVariables {
  constructor(
    private readonly lookup: (key: string) => SimIamConditionValue | undefined,
  ) {}

  /**
   * Replace every variable in a policy value, or answer undefined where one
   * has no value.
   */
  resolve(text: string, mode: SimIamVariableMode): string | undefined {
    let resolved = "";
    let rest = text;
    let start = rest.indexOf("${");

    while (start !== -1) {
      const end = rest.indexOf("}", start);

      if (end === -1) {
        break;
      }

      const value = this.variable(rest.slice(start + 2, end), mode);

      if (value === undefined) {
        return undefined;
      }

      resolved += rest.slice(0, start) + value;
      rest = rest.slice(end + 1);
      start = rest.indexOf("${");
    }

    return resolved + rest;
  }

  /**
   * Replace the variables in the resource part of a `Resource` or
   * `NotResource` ARN, which is everything after its fifth colon.
   *
   * AWS replaces nothing in the service, Region or Account. A pattern with
   * fewer than five colons, such as `*`, has no resource part.
   */
  resolveResource(pattern: string): string | undefined {
    let colon = -1;

    for (let count = 0; count < resourcePartColon; count++) {
      colon = pattern.indexOf(":", colon + 1);

      if (colon === -1) {
        return pattern;
      }
    }

    const resource = this.resolve(pattern.slice(colon + 1), "pattern");

    return resource === undefined
      ? undefined
      : pattern.slice(0, colon + 1) + resource;
  }

  /**
   * The text one variable stands for.
   */
  private variable(name: string, mode: SimIamVariableMode): string | undefined {
    const special = specialCharacters.get(name);

    if (special !== undefined) {
      return mode === "pattern" ? special.pattern : special.text;
    }

    const comma = name.indexOf(",");
    const value =
      comma === -1
        ? this.scalar(name)
        : (this.scalar(name.slice(0, comma)) ??
          defaultValue(name.slice(comma + 1)));

    if (value === undefined) {
      return undefined;
    }

    const text = String(value);

    return mode === "pattern"
      ? text
          .replaceAll("*", () => simIamLiteralAsterisk)
          .replaceAll("?", () => simIamLiteralQuestionMark)
      : text;
  }

  /**
   * The single value the request carries for a key, or undefined where it
   * carries none or a list.
   */
  private scalar(key: string): string | number | boolean | undefined {
    const value = this.lookup(key.trim());

    return typeof value === "object" ? undefined : value;
  }
}

/**
 * The default a variable gives after its comma, in single quotes, or undefined
 * where it gives none.
 */
function defaultValue(text: string): string | undefined {
  const quoted = text.trim();

  return quoted.startsWith("'") && quoted.endsWith("'")
    ? quoted.slice(1, -1)
    : undefined;
}
