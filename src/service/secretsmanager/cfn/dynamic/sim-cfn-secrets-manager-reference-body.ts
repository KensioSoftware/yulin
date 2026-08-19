import { isSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";

/** How a secret ARN starts, and how many colon-separated parts it has. */
const arnPrefix = "arn:";
const arnPartCount = 7;

/** The only secret field a dynamic reference can name. */
const secretStringField = "SecretString";

/** The segments a reference takes after the secret id. */
const referenceSegmentCount = 4;

/**
 * What a reference body could not be read as.
 *
 * The message is the middle of the sentence a stand-in value is recorded with,
 * so it reads as a clause rather than as a sentence of its own.
 */
export class SimCfnSecretsManagerReferenceProblem extends Error {
  public override readonly name = "SimCfnSecretsManagerReferenceProblem";
}

/**
 * A reference body read as the five segments CloudFormation documents.
 */
export interface SimCfnSecretsManagerReference {
  /** The secret's friendly name, full ARN or partial ARN. */
  readonly secretId: string;

  /** The Account and Region a full ARN names, where the body carries one. */
  readonly scope: SimAwsAccountRegionScope | undefined;

  /** The key of a JSON secret to read, where the body names one. */
  readonly jsonKey: string | undefined;

  /** The staging label to read, defaulting to AWSCURRENT further down. */
  readonly versionStage: string | undefined;

  /** The version id to read, which cannot be given alongside a stage. */
  readonly versionId: string | undefined;
}

/**
 * Read a `{{resolve:secretsmanager:...}}` body as its segments.
 *
 * CloudFormation documents the body as
 * `secret-id:secret-string:json-key:version-stage:version-id`, of which only
 * the secret id is required. A trailing segment left empty means the same as
 * one left out, so `MySecret::::` and `MySecret` name the same value.
 *
 * The secret id is taken first and by shape rather than by splitting the whole
 * body, because a secret ARN holds colons of its own. An ARN has seven parts,
 * and the segments after the secret id have none, so splitting from the left
 * over-splits every reference carrying one.
 */
export function parseSimCfnSecretsManagerReference(
  body: string,
): SimCfnSecretsManagerReference {
  const parts = body.split(":");
  const idPartCount = body.startsWith(arnPrefix) ? arnPartCount : 1;
  const secretId = parts.slice(0, idPartCount).join(":");

  if (secretId === "") {
    return refuse("which names no secret");
  }

  const segments = parts.slice(idPartCount);

  if (segments.length > referenceSegmentCount) {
    return refuse(
      `whose body has more than the secret id, secret-string, json-key, ` +
        `version-stage and version-id a secretsmanager dynamic reference takes`,
    );
  }

  const [secretString, jsonKey, versionStage, versionId] = segments.map(given);

  if (secretString !== undefined && secretString !== secretStringField) {
    return refuse(
      `whose secret-string segment is '${secretString}', where a ` +
        `secretsmanager dynamic reference reads ${secretStringField} only`,
    );
  }

  if (versionStage !== undefined && versionId !== undefined) {
    return refuse(
      `which names both a version stage and a version id, where a ` +
        `secretsmanager dynamic reference takes one or the other`,
    );
  }

  return {
    secretId,
    scope: referenceScope(secretId),
    jsonKey,
    versionStage,
    versionId,
  };
}

/**
 * The Account and Region a secret ARN names, for a reference reading another
 * Account's simulated Secrets Manager.
 *
 * Nothing comes back for a friendly name or a partial ARN, which name a secret
 * in the Stack's own Account and Region.
 */
function referenceScope(
  secretId: string,
): SimAwsAccountRegionScope | undefined {
  if (!secretId.startsWith(arnPrefix)) {
    return undefined;
  }

  const parts = secretId.split(":");

  if (parts.length !== arnPartCount) {
    return undefined;
  }

  const [regionName, accountId] = parts.slice(3);

  if (regionName === undefined || !isSimAwsAccountId(accountId)) {
    return undefined;
  }

  return { accountId, regionName: regionName as AwsRegionName };
}

/**
 * A segment that was left out and one left empty mean the same thing.
 */
function given(segment: string | undefined): string | undefined {
  return segment === undefined || segment === "" ? undefined : segment;
}

function refuse(problem: string): never {
  throw new SimCfnSecretsManagerReferenceProblem(problem);
}
