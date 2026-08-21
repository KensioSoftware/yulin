import { SimCognitoInvalidParameterException } from "../../../error/sim-cognito.error.js";
import {
  SimCognitoWebAuthnChallengeNotFoundException,
  SimCognitoWebAuthnOriginNotAllowedException,
} from "../../../error/sim-cognito-web-authn.error.js";

/**
 * What the client data of a ceremony has to say.
 */
export interface SimCognitoWebAuthnClientDataRequest {
  /** The input the credential arrived in, which a refusal names. */
  readonly field: string;

  /** Which half of the ceremony this is. */
  readonly type: "webauthn.create" | "webauthn.get";

  /** The challenge the pool issued, which the credential has to answer. */
  readonly challenge: string;

  /** The domain the credential has to have been collected for. */
  readonly relyingPartyId: string;
}

/**
 * The client data a credential carries, parsed as the JSON it is.
 */
function clientDataOf(
  clientDataJson: Buffer,
  field: string,
): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(clientDataJson.toString("utf8"));

    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Falls through to the refusal below, which says the same thing about an
    // unparseable client data as about one that is not an object.
  }

  throw new SimCognitoInvalidParameterException(
    `${field} response.clientDataJSON is not the JSON object a browser ` +
      `collects for a WebAuthn ceremony`,
  );
}

/**
 * Refuse client data that answers something other than the challenge this pool
 * issued, or that was collected somewhere the relying party does not cover.
 *
 * The client data is what the authenticator signed over, so what it says about
 * the ceremony is worth as much as the signature that covers it. A credential
 * collected at another origin is what a relying party check is for, and one
 * carrying another challenge is a replay.
 */
export function requireSimCognitoWebAuthnClientData(
  clientDataJson: Buffer,
  request: SimCognitoWebAuthnClientDataRequest,
): void {
  const { field, type, challenge, relyingPartyId } = request;
  const clientData = clientDataOf(clientDataJson, field);

  if (clientData["type"] !== type) {
    throw new SimCognitoInvalidParameterException(
      `${field} response.clientDataJSON is for ` +
        `'${String(clientData["type"])}' rather than '${type}'`,
    );
  }

  if (clientData["challenge"] !== challenge) {
    throw new SimCognitoWebAuthnChallengeNotFoundException(
      "The credential answers a challenge this user pool did not issue, or " +
        "one it has already spent.",
    );
  }

  if (clientData["origin"] !== `https://${relyingPartyId}`) {
    throw new SimCognitoWebAuthnOriginNotAllowedException(
      `The credential was collected at '${String(clientData["origin"])}', ` +
        `which is not an origin of the relying party ${relyingPartyId}.`,
    );
  }
}
