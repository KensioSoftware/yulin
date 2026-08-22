import { SimStatesInvalidName } from "../error/sim-step-functions.error.js";

const maximumNameLength = 80;

// Whitespace, brackets, wildcards and the special set real Step Functions
// refuses in a name. Control characters are checked by code point below, since
// a character class holding them reads as a mistake.
const refusedCharacters = /[\s<>{}[\]?*"#%\\^|~`$&,;:/]/;

/**
 * Check a state machine or execution name against the rules real Step
 * Functions holds them to.
 *
 * A name carrying a colon matters here beyond matching AWS. It would build an
 * ARN with an extra colon-separated part, which the ARN parser then reads as
 * something else entirely.
 */
export function checkSimStatesName(name: string, field: string): string {
  if (name.length === 0 || name.length > maximumNameLength) {
    throw new SimStatesInvalidName(
      `${field} is ${String(name.length)} characters. A name is 1 to ` +
        `${String(maximumNameLength)}.`,
    );
  }

  if (refusedCharacters.test(name) || hasControlCharacter(name)) {
    throw new SimStatesInvalidName(
      `${field} carries a character Step Functions does not allow in a name. ` +
        "Whitespace, brackets, wildcards, control characters and the set " +
        '" # % \\ ^ | ~ ` $ & , ; : / are all refused.',
    );
  }

  return name;
}

/**
 * Whether a name holds a control character, a surrogate or a non-character.
 */
function hasControlCharacter(name: string): boolean {
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0;

    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0xd8_00 && code <= 0xdf_ff) ||
      code >= 0xff_fe
    ) {
      return true;
    }
  }

  return false;
}
