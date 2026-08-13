import { CreateKeyValueStoreCommand } from "@aws-sdk/client-cloudfront";
import {
  assertArrayLength,
  assertStringIncludes,
  assertIdentical,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { BackgroundTasks } from "../../../util/background/background.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamAllowAllAuth } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimCfKeyValueStoreAccess } from "./sim-cf-key-value-store-access.js";
import { SimCfKeyValueStoreCommands } from "./sim-cf-key-value-store-commands.js";
import { SimCloudFrontKeyValueStoreRegistry } from "./sim-cf-key-value-store-registry.js";
import {
  noKeyValueStoreUsers,
  type SimCfKeyValueStoreUsers,
} from "./sim-cf-key-value-store-users.js";

function commandsWith(
  users: SimCfKeyValueStoreUsers,
): SimCfKeyValueStoreCommands {
  return new SimCfKeyValueStoreCommands(
    new SimCfKeyValueStoreAccess({
      accountId: makeSimAwsAccountId(),
      stores: new SimCloudFrontKeyValueStoreRegistry(),
      iam: new SimIamAllowAllAuth(),
      background: new BackgroundTasks(),
    }),
    users,
  );
}

describe("Deleting a key value store something still uses", () => {
  it("says nothing uses any store, for a CloudFront with no Functions", () => {
    // Given the default collaborator, which is what a standalone sim
    // CloudFront with no Function map gets
    // When it is asked what uses a store
    // Then nothing does
    assertArrayLength(
      noKeyValueStoreUsers.functionsUsing(
        "any-store-id" as Parameters<
          SimCfKeyValueStoreUsers["functionsUsing"]
        >[0],
      ),
      0,
    );
  });

  it("refuses to delete a store a Function is associated with", async () => {
    // Given a store that something reports as being in use
    const stores = commandsWith({
      functionsUsing: (): readonly string[] => ["viewer-request-cff"],
    });
    const created = await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "redirects" }),
    );

    // When it is deleted
    const error = await assertThrowsErrorAsync(
      async () =>
        await stores.deleteKeyValueStore({
          input: { Name: "redirects", IfMatch: created.ETag },
        }),
    );

    // Then CloudFront refuses it, naming what is still using it, and the store
    // is still there
    assertIdentical(error.name, "CannotDeleteEntityWhileInUse");
    assertStringIncludes(error.message, "viewer-request-cff");
    assertIdentical(stores.byName("redirects")?.name, "redirects");
  });

  it("deletes a store nothing is associated with", async () => {
    // Given a store nothing reports as being in use
    const stores = commandsWith(noKeyValueStoreUsers);
    const created = await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "redirects" }),
    );

    // When it is deleted
    await stores.deleteKeyValueStore({
      input: { Name: "redirects", IfMatch: created.ETag },
    });

    // Then it is gone
    assertUndefined(stores.byName("redirects"));
  });
});
