import { simRestApiParsedPolicy } from "../../api/policy/sim-rest-api-policy.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimRestApiPatchOperation } from "./rest-api.command.js";

/**
 * The paths of a REST API an update can replace.
 */
const replaceablePaths = ["/name", "/description", "/policy"] as const;

type ReplaceablePath = (typeof replaceablePaths)[number];

/**
 * What an update asks to change about a REST API.
 */
export interface SimRestApiPatch {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  /** The resource policy, which an empty value removes. */
  readonly policy?: string | undefined;
}

/**
 * Read the patch operations of an `UpdateRestApi` request.
 *
 * Every API Gateway v1 update is written this way, as a list of JSON-Patch
 * style operations against the resource being changed, rather than as the
 * fields to set. Only replacing the name, the description and the resource
 * policy is simulated. Anything else is refused, so an update cannot look
 * applied here and change something on real AWS.
 */
export function simRestApiPatchOf(
  operations: readonly SimRestApiPatchOperation[],
): SimRestApiPatch {
  const patch: { name?: string; description?: string; policy?: string } = {};

  for (const operation of operations) {
    assertReplace(operation);
    const path = assertReplaceablePath(operation);

    if (path === "/name") {
      patch.name = requireValue(operation);
    } else if (path === "/description") {
      patch.description = operation.value ?? "";
    } else {
      patch.policy = operation.value ?? "";
    }
  }

  return patch;
}

/**
 * Apply the patch operations of an `UpdateRestApi` request to an API.
 *
 * The policy is read before anything changes, so a request with a policy that
 * is refused leaves the API as it was.
 */
export function simRestApiApplyPatch(
  restApi: SimRestApi,
  operations: readonly SimRestApiPatchOperation[],
): void {
  const patch = simRestApiPatchOf(operations);
  const policy =
    patch.policy === undefined
      ? restApi.policy
      : simRestApiParsedPolicy(restApi, patch.policy);

  restApi.name = patch.name ?? restApi.name;
  restApi.description = patch.description ?? restApi.description;
  restApi.policy = policy;
}

function assertReplace(operation: SimRestApiPatchOperation): void {
  if (operation.op === "replace") {
    return;
  }

  throw new SimApiGatewayBadRequest(
    `UpdateRestApi op '${operation.op ?? ""}' is not simulated: only ` +
      `'replace' is supported`,
  );
}

function assertReplaceablePath(
  operation: SimRestApiPatchOperation,
): ReplaceablePath {
  const path = operation.path ?? "";

  if (!isReplaceablePath(path)) {
    throw new SimApiGatewayBadRequest(
      `UpdateRestApi path '${path}' is not simulated: only ` +
        `${replaceablePaths.map((one) => `'${one}'`).join(", ")} can be ` +
        `replaced`,
    );
  }

  return path;
}

function isReplaceablePath(path: string): path is ReplaceablePath {
  return (replaceablePaths as readonly string[]).includes(path);
}

function requireValue(operation: SimRestApiPatchOperation): string {
  if (operation.value === undefined || operation.value.length === 0) {
    throw new SimApiGatewayBadRequest(
      `UpdateRestApi replacing ${operation.path ?? ""} requires a value`,
    );
  }

  return operation.value;
}
