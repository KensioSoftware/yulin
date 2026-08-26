import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simIamPolicyDocumentFactory } from "../iam/policy/sim-iam-policy-document.factory.js";
import { aRanQuery } from "./sim-athena-ran-query.fixture.js";
import {
  aScannedSimulation,
  aSeededObject,
} from "./sim-athena-scanned-bytes.fixture.js";

describe("the Athena cutoff against what a query measured", () => {
  it("fails a query whose measured bytes pass the cutoff", async () => {
    // Given a workgroup allowing 500 bytes a query, and a table holding more.
    const { simAws, workGroup } = await aScannedSimulation({}, 500);

    await aSeededObject(simAws, "logs/part-0.json", 900);

    // When a query runs against it.
    const ran = await aRanQuery(
      simAws,
      workGroup,
      "SELECT url FROM rainlytics.access_logs",
    );

    // Then the guardrail refuses it against data the test seeded, naming both
    // figures.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(ran.reason, "Bytes scanned limit was exceeded");
    assertStringIncludes(ran.reason, "900");
    assertIdentical(ran.scanned, 900);
  });

  it("takes a declared figure over the objects on the ground", async () => {
    // Given a table holding one small object, and a test saying the query
    // scans a great deal more.
    const { simAws, workGroup } = await aScannedSimulation({}, 500);

    await aSeededObject(simAws, "logs/part-0.json", 10);

    const sql = "SELECT url FROM rainlytics.access_logs";
    simAws.athena().results().onQuery(sql, { bytesScanned: 5000 });

    // When the query runs.
    const ran = await aRanQuery(simAws, workGroup, sql);

    // Then the declaration answers, so a test can still drive the guardrail
    // without seeding anything.
    assertIdentical(ran.state, "FAILED");
    assertIdentical(ran.scanned, 5000);
  });

  it("fails a caller who cannot read the data", async () => {
    // Given a table with data, and a role allowed to run the query and
    // nothing else.
    const { simAws, workGroup } = await aScannedSimulation();

    await aSeededObject(simAws, "logs/part-0.json", 100);

    const roleName = `athena-caller-${faker.string.uuid()}`;
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: "AthenaOnly",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: [{ Effect: "Allow", Action: "athena:*", Resource: "*" }],
        }),
      }),
    );

    // When that role runs the query.
    const ran = await aRanQuery(
      simAws,
      workGroup,
      "SELECT url FROM rainlytics.access_logs",
      { kind: "arn", arn: role.Role.Arn },
    );

    // Then the query fails naming the Bucket it could not read. Athena reads
    // a table's data under the identity that asked for it.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(ran.reason, "rainlytics-logs");
  });
});
