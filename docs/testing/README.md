# Test suite setup

Run one Yulin environment for an application's test suite. Create the simulation, deploy the
application's infrastructure, and install AWS SDK interception once. Every test then interacts with
the same simulated account and resources.

This is the recommended setup. It matches the way a suite uses a shared AWS account or a
container-based simulator such as LocalStack. Creating a new Yulin environment for every test or
test file is supported, but it should be reserved for cases that need a blank simulated account.

The simulated clock is the main exception. A suite-wide `SimAws` has one clock, so a test that moves
it changes time for every resource in that environment. Keep the majority of tests in the shared
environment without changing its clock. Put clock-controlling tests in a smaller isolated group.

## Split the Vitest suite

Yulin holds state in the process that created it. Vitest must run the Yulin tests in one worker for
all shared files to reach the same environment. Give that project disabled file parallelism and file
isolation, then load a setup module before each test file.

The second project below matches files ending in `.clock.test.ts`. Those tests do not load the shared
setup and can create isolated Yulin environments:

```typescript testing-vitest-config
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "shared Yulin",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.clock.test.ts"],
          fileParallelism: false,
          isolate: false,
          setupFiles: ["./test/setup-yulin.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "isolated Yulin clock",
          include: ["test/**/*.clock.test.ts"],
        },
      },
    ],
  },
});
```

Vitest executes a `setupFiles` entry before every test file. With isolation disabled, modules
imported by that entry stay cached in the worker. Put the Yulin initialization in an imported module
to make it run once.

See Vitest's documentation for [`setupFiles`](https://vitest.dev/config/setupfiles),
[`fileParallelism`](https://vitest.dev/config/fileparallelism), and
[`isolate`](https://vitest.dev/config/isolate).

## Create and deploy the shared environment

Put the suite environment in a module such as `test/yulin-environment.ts`. Intercept client classes
used by the application and deploy its synthesized CDK cloud assembly:

```typescript testing-shared-yulin-environment
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import type { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

interface YulinTestEnvironment {
  readonly simAws: SimAws;
  readonly simSdk: SimSdk;
  readonly uploadsBucketName: string;
}

type YulinTestGlobal = typeof globalThis & {
  yulinEnvironment?: Promise<YulinTestEnvironment>;
};

const testGlobal = globalThis as YulinTestGlobal;

// oxlint-disable-next-line unicorn-js/prefer-top-level-await -- The shared promise prevents setup from running again before another test file.
export const yulin = await (testGlobal.yulinEnvironment ??= startYulin());

async function startYulin(): Promise<YulinTestEnvironment> {
  const simSdk = new SimSdk();
  simSdk.intercept(DynamoDBClient);
  simSdk.intercept(S3Client);

  const stacks = await simSdk.simAws.cloudFormation().deployCdkOut({
    directoryPath: "cdk.out",
    stackNames: ["ApplicationStack"],
  });
  const appStack = stacks.get("ApplicationStack");

  if (appStack === undefined) {
    throw new Error("ApplicationStack was not deployed");
  }

  process.once("exit", () => {
    simSdk.restoreAll();
  });

  return {
    simAws: simSdk.simAws,
    simSdk,
    uploadsBucketName: appStack.output("UploadsBucketName"),
  };
}
```

Use the same templates that the application deploys. `deployCdkOut(...)` can deploy the whole cloud
assembly or the named application Stacks. Read generated resource names from stack outputs or
resource accessors after deployment.

The configured setup entry only needs to import that module:

```typescript
// test/setup-yulin.ts
import "./yulin-environment.js";
```

Do not put the initialization directly in `setup-yulin.ts`. Vitest executes that file for every test
file, even when isolation is disabled.

## Use the environment from every test

Application code continues to construct and send through ordinary AWS SDK clients. Class-level
interception routes all of them to the suite's Yulin environment.

A test that needs direct access can import the shared environment:

```typescript
import { randomUUID } from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { expect, it } from "vitest";

import { yulin } from "../yulin-environment.js";

it("stores an upload", async () => {
  const key = `test-uploads/${randomUUID()}.txt`;
  const s3 = new S3Client({ region: "eu-west-2" });

  await s3.send(
    new PutObjectCommand({
      Bucket: yulin.uploadsBucketName,
      Key: key,
      Body: "an upload",
    }),
  );

  const stored = await yulin.simAws
    .region("eu-west-2")
    .s3()
    .getObject(
      new GetObjectCommand({
        Bucket: yulin.uploadsBucketName,
        Key: key,
      }),
    );

  expect(await stored?.Body?.transformToString()).toBe("an upload");
});
```

The `SimAws` object is mainly useful for preparing input state and reading state back in assertions.
Exercise the application through its normal interfaces whenever possible.

## Keep tests independent in shared state

Shared infrastructure does not require tests to depend on one another. Give each test's records,
object keys, user names, and other mutable data unique values. Read CloudFormation-generated names
from the deployed stack. Avoid assertions that assume the simulated account contains no other data.

Keep `beforeEach` for the records a test needs. A per-file `beforeAll` can prepare data used by every
test in that file. Leave the suite's stacks and SDK interception in place until the worker exits.

Tests run sequentially with `fileParallelism: false`. If a test uses `it.concurrent`, its data still
needs unique identifiers because those cases share the same environment at the same time.

## Give clock-controlling tests their own environment

Every service in a `SimAws` reads the same simulated clock. Calling `advanceBy(...)` can expire
credentials, delete resources whose retention period has passed, and run scheduled work anywhere in
the environment. Resetting the clock afterwards cannot reverse those changes.

Tests in the shared project should treat the clock as read-only. Put a test that calls `freeze()`,
`setTo(...)`, `advanceBy(...)`, or `resume()` in a `.clock.test.ts` file and create a fresh environment
inside the test:

```typescript
import { SimAws, SimFixedClock } from "@kensio/yulin";
import { it } from "vitest";

it("expires a session", async () => {
  const simAws = new SimAws({
    clock: new SimFixedClock(new Date("2026-09-04T09:00:00.000Z")),
  });

  // Deploy only the infrastructure this clock-controlling test needs.

  await simAws.clock().advanceBy({ minutes: 20 });

  // Assert the behaviour after the time change.
});
```

Create a `SimSdk` around that `SimAws` when application code uses SDK clients. Restore its
interceptions at the end of the test. The [simulated time guide](https://yulinsim.dev/time/) describes
what moving the clock runs and changes.

## When to create another environment

A fresh `SimAws` or `SimSdk` is useful when the empty environment is part of the behaviour under
test, or when the test needs to control simulated time. Yulin's own service unit tests are another
example because they test resource creation and account isolation directly.

Vitest workers cannot share an in-memory `SimAws`. A suite that keeps file parallelism creates one
environment per worker. Put Yulin-based application tests in a Vitest project with
`fileParallelism: false` when the rest of the unit suite should remain parallel.
