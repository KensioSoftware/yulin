import { createHash } from "node:crypto";

import { SimCognitoInvalidParameterException } from "../../../error/sim-cognito.error.js";
import { SimCognitoWebAuthnRelyingPartyMismatchException } from "../../../error/sim-cognito-web-authn.error.js";
import {
  requireSimCognitoWebAuthnClientData,
  type SimCognitoWebAuthnClientDataRequest,
} from "./sim-cognito-web-authn-client-data.js";

/**
 * How many bytes of authenticator data come before the flags, which is the
 * hash of the relying party id.
 */
const relyingPartyHashBytes = 32;

/**
 * What a caller sent, once it has been read as a credential.
 */
export interface SimCognitoWebAuthnCeremony {
  readonly credentialId: string;
  readonly clientDataJson: Buffer;
  readonly authenticatorData: Buffer;

  /** The credential document itself, once it has been read as an object. */
  readonly document: Readonly<Record<string, unknown>>;

  /** The `response` half of it, which holds what the authenticator produced. */
  readonly response: Readonly<Record<string, unknown>>;
}

/**
 * What a request carried, and what the pool expects it to answer.
 */
export interface SimCognitoWebAuthnCeremonyRequest extends SimCognitoWebAuthnClientDataRequest {
  /** The credential document the request carried, as it arrived. */
  readonly credential: unknown;
}

/**
 * A member of a credential that has to be there, as the base64url it is.
 */
function requireMember(value: unknown, member: string, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new SimCognitoInvalidParameterException(
      `${field} ${member} must be the base64url string a browser's own ` +
        `credential serialization carries it as`,
    );
  }

  return value;
}

/**
 * Refuse authenticator data signed for another relying party.
 */
function requireRelyingParty(
  authenticatorData: Buffer,
  relyingPartyId: string,
): void {
  const signedFor = authenticatorData.subarray(0, relyingPartyHashBytes);

  if (!signedFor.equals(createHash("sha256").update(relyingPartyId).digest())) {
    throw new SimCognitoWebAuthnRelyingPartyMismatchException(
      `The credential was signed for another relying party, and this user ` +
        `pool registers passkeys against ${relyingPartyId}.`,
    );
  }
}

/**
 * The credential document a request carried, or a refusal where it is not one.
 */
function requireDocument(
  value: unknown,
  field: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) {
    throw new SimCognitoInvalidParameterException(
      `${field} must be the credential a browser serializes from ` +
        `navigator.credentials, carrying an id and a response`,
    );
  }

  return value as Record<string, unknown>;
}

/**
 * Read the credential a request carried, and hold it to the ceremony the pool
 * is part way through.
 *
 * A credential arrives as the JSON a browser produces from a
 * `PublicKeyCredential`, so it is read rather than trusted: the client data
 * says which ceremony it answers, which challenge, and where it was collected,
 * and the authenticator data says which relying party it was signed for. What
 * this leaves to the caller is the signature, which needs the public key of
 * the credential being presented.
 */
export function requireSimCognitoWebAuthnCeremony(
  request: SimCognitoWebAuthnCeremonyRequest,
): SimCognitoWebAuthnCeremony {
  const { field } = request;
  const document = requireDocument(request.credential, field);
  const response = requireDocument(document["response"], field);
  const clientDataJson = Buffer.from(
    requireMember(response["clientDataJSON"], "clientDataJSON", field),
    "base64url",
  );
  const authenticatorData = Buffer.from(
    requireMember(response["authenticatorData"], "authenticatorData", field),
    "base64url",
  );

  requireSimCognitoWebAuthnClientData(clientDataJson, request);
  requireRelyingParty(authenticatorData, request.relyingPartyId);

  return {
    credentialId: requireMember(document["id"], "id", field),
    clientDataJson,
    authenticatorData,
    document,
    response,
  };
}
