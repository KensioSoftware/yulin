import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { parseSimEcsSecretReference } from "./sim-ecs-secret-reference-parse.js";

const secretArn =
  "arn:aws:secretsmanager:eu-west-2:111111111111:secret:db-AbCdEf";

describe("Reading a simulated ECS container secret's valueFrom", () => {
  it("reads a Secrets Manager ARN", () => {
    // Given a plain secret ARN.
    // When it is read.
    const reference = parseSimEcsSecretReference(secretArn);

    // Then it names the secret in the account and region the ARN carries.
    assertIdentical(reference.store, "secretsmanager");
    assertIdentical(reference.identifier, "db-AbCdEf");
    assertIdentical(reference.accountId, "111111111111");
    assertIdentical(reference.regionName, "eu-west-2");
    assertUndefined(reference.jsonKey);
  });

  it("reads the JSON key, stage and version a secret ARN may end with", () => {
    // Given the extended form real ECS accepts.
    // When it is read.
    const reference = parseSimEcsSecretReference(
      `${secretArn}:password:AWSPREVIOUS:v-1`,
    );

    // Then each selector is picked out, and the secret id stops before them.
    assertIdentical(reference.identifier, "db-AbCdEf");
    assertIdentical(reference.jsonKey, "password");
    assertIdentical(reference.versionStage, "AWSPREVIOUS");
    assertIdentical(reference.versionId, "v-1");
  });

  it("treats an empty selector as one that was not given", () => {
    // Given the form a CDK construct writes for a field with no version.
    // When it is read.
    const reference = parseSimEcsSecretReference(`${secretArn}:password::`);

    // Then only the key was given.
    assertIdentical(reference.jsonKey, "password");
    assertUndefined(reference.versionStage);
    assertUndefined(reference.versionId);
  });

  it("reads an SSM parameter ARN back to its name", () => {
    // Given a parameter ARN, which drops the name's leading slash.
    // When it is read.
    const reference = parseSimEcsSecretReference(
      "arn:aws:ssm:eu-west-2:111111111111:parameter/orders/api-key",
    );

    // Then the name is put back together with its slash.
    assertIdentical(reference.store, "ssm");
    assertIdentical(reference.identifier, "/orders/api-key");
    assertIdentical(reference.regionName, "eu-west-2");
  });

  it("leaves a top-level parameter name without a leading slash", () => {
    // Given a parameter ARN naming no hierarchy.
    // When it is read.
    const reference = parseSimEcsSecretReference(
      "arn:aws:ssm:eu-west-2:111111111111:parameter/api-key",
    );

    // Then it is the name as Parameter Store holds it.
    assertIdentical(reference.identifier, "api-key");
  });

  it("takes something that is not an ARN as a parameter name", () => {
    // Given a bare name, which real ECS allows in the task's own region.
    // When it is read.
    const reference = parseSimEcsSecretReference("/orders/api-key");

    // Then it names no scope, so the task's own is used.
    assertIdentical(reference.store, "ssm");
    assertIdentical(reference.identifier, "/orders/api-key");
    assertUndefined(reference.accountId);
    assertUndefined(reference.regionName);
  });

  it("refuses a store that is not simulated", () => {
    // Given an ARN naming a store other than the two simulated ones.
    // When it is read.
    const error = assertThrowsError(() =>
      parseSimEcsSecretReference(
        "arn:aws:kms:eu-west-2:111111111111:key/abc-123",
      ),
    );

    // Then it says which stores there are, rather than guessing.
    assertStringIncludes(error.message, "only Secrets Manager and");
  });

  it("refuses an SSM ARN that does not name a parameter", () => {
    // Given an ARN for something else in Systems Manager.
    // When it is read.
    const error = assertThrowsError(() =>
      parseSimEcsSecretReference(
        "arn:aws:ssm:eu-west-2:111111111111:document/RunShellScript",
      ),
    );

    // Then it says only Parameter Store is simulated.
    assertStringIncludes(error.message, "only");
    assertStringIncludes(error.message, "Parameter Store is simulated");
  });

  it("refuses an ARN naming no secret at all", () => {
    // Given a secret ARN that stops at its resource type.
    // When it is read.
    const error = assertThrowsError(() =>
      parseSimEcsSecretReference(
        "arn:aws:secretsmanager:eu-west-2:111111111111:secret:",
      ),
    );

    // Then it says so rather than looking the empty name up.
    assertStringIncludes(error.message, "names no secret or parameter");
  });
});
