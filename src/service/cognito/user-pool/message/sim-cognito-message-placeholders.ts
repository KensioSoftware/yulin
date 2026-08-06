/**
 * The placeholder a pool's wording carries where the code belongs.
 *
 * It is `codeParameter` in a `CustomMessage` event, which is what a handler
 * writes into the message it returns so that Cognito fills the code in
 * afterwards.
 */
export const simCognitoCodeParameter = "{####}";

/**
 * The placeholder the invitation wording carries where the username belongs,
 * which is `usernameParameter` in a `CustomMessage` event.
 */
export const simCognitoUsernameParameter = "{username}";

interface SimCognitoMessagePlaceholdersProperties {
  readonly username: string;

  /**
   * The confirmation code or temporary password the message carries, or
   * nothing where the pool has none to put in it.
   */
  readonly code?: string | undefined;
}

/**
 * Fills in the placeholders a message's wording carries.
 *
 * The substitution runs after the `CustomMessage` trigger rather than before
 * it, because that is the order real Cognito runs it in: a handler writes
 * `codeParameter` into its own wording, and the code replaces it in whatever
 * wording the message ends up with.
 *
 * A placeholder with nothing to put in it is left as it is, so a message that
 * was never given a code reads as one rather than quietly losing the
 * placeholder.
 */
export class SimCognitoMessagePlaceholders {
  private readonly username: string;
  private readonly code: string | undefined;

  constructor(properties: SimCognitoMessagePlaceholdersProperties) {
    this.username = properties.username;
    this.code = properties.code;
  }

  /**
   * The text with every placeholder this knows a value for filled in.
   */
  fill(text: string): string {
    // The replacement is a function so that a `$` in a username or a code is
    // put in as it is, rather than being read as a replacement pattern.
    return this.filledCode(text).replaceAll(
      simCognitoUsernameParameter,
      () => this.username,
    );
  }

  /**
   * The same for a subject a medium may not have.
   */
  fillOptional(text: string | undefined): string | undefined {
    if (text === undefined) {
      return undefined;
    }

    return this.fill(text);
  }

  private filledCode(text: string): string {
    const { code } = this;

    if (code === undefined) {
      return text;
    }

    return text.replaceAll(simCognitoCodeParameter, () => code);
  }
}
