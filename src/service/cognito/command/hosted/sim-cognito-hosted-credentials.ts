import type { SimCognitoAuthorizeInput } from "./hosted-auth.command.js";

/**
 * The username and password managed login's form posts.
 *
 * Real managed login reads these two out of its form, and this simulation
 * reads them out of the authorize request, because a get carrying them and a
 * post of the form it serves are the same request here. A request carrying
 * neither has nobody to sign in, and the sign-in it is part of decides what to
 * do about that.
 */
export class SimCognitoHostedCredentials {
  public readonly username: string;
  public readonly password: string;

  private constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  /**
   * The credentials an authorize request carries, where it carries both.
   */
  static in(
    input: SimCognitoAuthorizeInput,
  ): SimCognitoHostedCredentials | undefined {
    const { username, password } = input;

    if (username === undefined || username === "") {
      return undefined;
    }

    if (password === undefined || password === "") {
      return undefined;
    }

    return new SimCognitoHostedCredentials(username, password);
  }
}
