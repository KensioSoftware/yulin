import {
  simEcsSecretArnPart,
  simEcsSecretArnPartGiven,
  simEcsSecretArnPartRequired,
  simEcsSecretArnScope,
} from "./sim-ecs-secret-arn.js";
import type { SimEcsSecretReference } from "./sim-ecs-secret-reference.js";
import { SimEcsSecretResolutionError } from "./sim-ecs-secret.error.js";

/**
 * The prefix of the resource part of an SSM parameter ARN.
 */
const parameterResourcePrefix = "parameter/";

/**
 * A parameter named without a scope, resolved in the task's own.
 */
function parameterNamed(name: string): SimEcsSecretReference {
  return {
    store: "ssm",
    accountId: undefined,
    regionName: undefined,
    identifier: name,
    jsonKey: undefined,
    versionStage: undefined,
    versionId: undefined,
  };
}

/**
 * The parameter name an ARN's resource part stands for.
 *
 * A parameter ARN drops the leading slash of a hierarchical name, so it is put
 * back here. Parameter Store reads a parameter by either form, but the name
 * with its slash is the one a reason should quote back.
 */
function parameterNameIn(resource: string): string {
  if (resource.includes("/")) {
    return `/${resource}`;
  }

  return resource;
}

function secretReference(
  valueFrom: string,
  parts: readonly string[],
): SimEcsSecretReference {
  return {
    store: "secretsmanager",
    ...simEcsSecretArnScope(parts),
    identifier: simEcsSecretArnPartRequired(
      parts[simEcsSecretArnPart.secretId],
      valueFrom,
    ),
    jsonKey: simEcsSecretArnPartGiven(parts[simEcsSecretArnPart.jsonKey]),
    versionStage: simEcsSecretArnPartGiven(
      parts[simEcsSecretArnPart.versionStage],
    ),
    versionId: simEcsSecretArnPartGiven(parts[simEcsSecretArnPart.versionId]),
  };
}

function parameterReference(
  valueFrom: string,
  parts: readonly string[],
): SimEcsSecretReference {
  const resource = simEcsSecretArnPartRequired(
    parts[simEcsSecretArnPart.resource],
    valueFrom,
  );

  if (!resource.startsWith(parameterResourcePrefix)) {
    throw new SimEcsSecretResolutionError(
      `${valueFrom} is an SSM ARN that does not name a parameter, and only ` +
        `Parameter Store is simulated in Systems Manager.`,
    );
  }

  return {
    ...parameterNamed(
      parameterNameIn(resource.slice(parameterResourcePrefix.length)),
    ),
    ...simEcsSecretArnScope(parts),
  };
}

/**
 * Read a container secret's `valueFrom` into the store and identifier it names.
 *
 * A `valueFrom` that is not an ARN at all is an SSM parameter name, as it is on
 * real ECS, where a parameter in the task's own Region may be named without its
 * ARN. Anything else, including a store this simulation does not hold, is
 * refused rather than guessed at: a secret resolved from the wrong place is
 * worse than a task that says it could not resolve one.
 */
export function parseSimEcsSecretReference(
  valueFrom: string,
): SimEcsSecretReference {
  if (!valueFrom.startsWith("arn:")) {
    return parameterNamed(valueFrom);
  }

  const parts = valueFrom.split(":");
  const service = parts[simEcsSecretArnPart.service];

  if (service === "secretsmanager") {
    return secretReference(valueFrom, parts);
  }

  if (service === "ssm") {
    return parameterReference(valueFrom, parts);
  }

  throw new SimEcsSecretResolutionError(
    `${valueFrom} names ${String(service)}, and only Secrets Manager and SSM ` +
      `Parameter Store are simulated as container secret stores.`,
  );
}
