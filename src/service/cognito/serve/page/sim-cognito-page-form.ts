import { simCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoDomainRequest } from "../sim-cognito-domain-request.js";
import type { SimCognitoPageParameters } from "./sim-cognito-page-markup.js";
import { simCognitoCarriedParameters } from "./sim-cognito-page-paths.js";

/**
 * One request to a page, read as the form it fetched or posted.
 *
 * A page is reached with a query string and posted back with a form encoded
 * body, and both are name and value pairs. Which of the two a value came from
 * changes nothing about what the page does with it, so a form holds them the
 * same way and holds the method beside them.
 */
export class SimCognitoPageForm {
  /** The authorize parameters this page carries on to the next one. */
  public readonly parameters: SimCognitoPageParameters;

  private readonly request: SimCognitoDomainRequest;
  private readonly fields: SimCognitoPageParameters;

  constructor(
    request: SimCognitoDomainRequest,
    values: SimCognitoPageParameters,
  ) {
    this.request = request;
    this.fields = values;
    this.parameters = simCognitoCarriedParameters(values);
  }

  /**
   * The message a refusal is shown on the page as.
   */
  static messageIn(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "The request was refused";
  }

  /** The pool this page belongs to. */
  get pool(): SimCognitoUserPool {
    return this.request.pool;
  }

  /** The simulated Cognito scope the operations behind the pages run in. */
  get cognito(): SimCognitoDomainRequest["cognito"] {
    return this.request.cognito;
  }

  /** Whether the form was posted rather than fetched. */
  get isPosted(): boolean {
    return this.request.serviceRequest.request.method === "POST";
  }

  /** The app client the grant this page belongs to was started by. */
  get clientId(): string | undefined {
    return this.parameters["client_id"];
  }

  /** The user this page is about, which is empty until a form named one. */
  get username(): string {
    return this.fields["username"] ?? "";
  }

  /**
   * One field the form asked for.
   */
  field(name: string): string | undefined {
    return Object.entries(this.fields).find(([key]) => key === name)?.[1];
  }

  /**
   * The `SecretHash` a client with a secret needs, and nothing for one
   * without.
   *
   * Managed login computes this on the server rather than asking the browser
   * for a secret, and so does this.
   */
  secretHash(): { SecretHash?: string } {
    const { clientId, username } = this;
    const secret =
      clientId === undefined
        ? undefined
        : this.pool.findClient(clientId)?.secret;

    // This asks whether the app client has a secret at all, and compares none.
    // oxlint-disable-next-line security/detect-possible-timing-attacks
    if (secret === undefined || clientId === undefined) {
      return {};
    }

    return { SecretHash: simCognitoSecretHash(username, clientId, secret) };
  }
}
