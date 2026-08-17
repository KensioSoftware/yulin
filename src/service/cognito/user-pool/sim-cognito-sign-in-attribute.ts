import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

/**
 * How each attribute a pool can sign users in by is written, and how a
 * refusal describes it.
 *
 * These are the two Cognito allows in `UsernameAttributes`, and they are the
 * same two it can send a confirmation code to.
 */
const signInAttributeForms = new Map<string, SimCognitoSignInAttributeForm>([
  [
    "email",
    { description: "an email", pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/u },
  ],
  [
    "phone_number",
    { description: "a phone number", pattern: /^\+[1-9]\d{1,14}$/u },
  ],
]);

interface SimCognitoSignInAttributeForm {
  /** How a refusal names this attribute's values, such as `an email`. */
  readonly description: string;

  /** The shape a value has to take to be one of this attribute's. */
  readonly pattern: RegExp;
}

/**
 * One attribute a pool signs its users in by.
 *
 * Real Cognito holds the value a `UsernameAttributes` pool is signed in with
 * to the form of the attribute it fills, and refuses a `SignUp` carrying
 * anything else, so the form is checked here rather than left to reach the
 * pool as a username that could never sign in.
 */
export class SimCognitoSignInAttribute {
  public readonly name: string;
  private readonly form: SimCognitoSignInAttributeForm;

  constructor(name: string) {
    const form = signInAttributeForms.get(name);

    if (form === undefined) {
      throw new SimCognitoInvalidParameterException(
        `UsernameAttributes '${name}' is not an attribute Cognito can sign ` +
          `users in by. Only ${signInAttributeForms.keys().toArray().join(" and ")} can be`,
      );
    }

    this.name = name;
    this.form = form;
  }

  /**
   * How a refusal names the values of this attribute.
   */
  get description(): string {
    return this.form.description;
  }

  /**
   * Whether a value is written the way this attribute's values are.
   */
  holds(value: string): boolean {
    return this.form.pattern.test(value);
  }
}
