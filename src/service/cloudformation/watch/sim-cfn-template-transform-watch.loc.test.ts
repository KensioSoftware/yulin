import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  accountScopedName,
  accountScopedTemplate,
  withoutSynthesizedAccount,
} from "../../../../test/cloudformation/account-scoped-template.js";
import {
  putSitePage,
  sitePage,
  WatchedTemplate,
} from "../../../../test/cloudformation/watched-template.js";

describe("a watched template file with a transform", () => {
  it("transforms the changed file again on every save", async () => {
    // Given a Stack deployed from a watched template file through a transform
    // that takes the real account off the names in it
    const watched = await WatchedTemplate.of(
      accountScopedTemplate(),
      {},
      withoutSynthesizedAccount,
    );
    assertNonNullable(watched.simAws.s3().getSimBucketByName("site-content"));

    try {
      // When the stack is synthesized again with another Bucket in it
      await watched.write(accountScopedTemplate({ withUploads: true }));
      await watched.updated();

      // Then the update applied the transformed template, so the file being
      // watched stays the synthesized one with no derived copy of it on disk
      assertNonNullable(watched.simAws.s3().getSimBucketByName("site-uploads"));
      assertUndefined(
        watched.simAws
          .s3()
          .getSimBucketByName(accountScopedName("site-uploads")),
      );
    } finally {
      watched.stop();
    }
  });

  it("reports a transform that throws, and goes on watching", async () => {
    // Given a Stack deployed from a watched template file, holding an Object,
    // and a transform that fails on anything with an Uploads Bucket in it
    const watched = await WatchedTemplate.of(
      accountScopedTemplate(),
      {},
      (template) => {
        if ("Uploads" in template.Resources) {
          throw new Error("no Hosted Zone ID for the uploads domain");
        }

        return withoutSynthesizedAccount(template);
      },
    );
    await putSitePage(watched.simAws);

    try {
      // When a save the transform cannot adapt arrives
      await watched.write(accountScopedTemplate({ withUploads: true }));
      await watched.failedUpdates();

      // Then it is reported the way a failed update is, and the Resources
      // serving are the ones from before the change
      assertStringIncludes(
        watched.failed().at(0)?.message ?? "",
        "no Hosted Zone ID for the uploads domain",
      );
      assertIdentical(await sitePage(watched.simAws), "<h1>Hello</h1>");

      // And the next save the transform can adapt is applied, since what
      // failed was the update rather than the watch
      await watched.write(accountScopedTemplate({ withCache: true }));
      await watched.updated();

      assertNonNullable(watched.simAws.s3().getSimBucketByName("site-cache"));
    } finally {
      watched.stop();
    }
  });

  it("reads the file as it is when the deployment brought no transform", async () => {
    // Given a Stack deployed from a watched template file with no transform
    const watched = await WatchedTemplate.of(accountScopedTemplate());

    try {
      // When it is synthesized again
      await watched.write(accountScopedTemplate({ withUploads: true }));
      await watched.updated();

      // Then what the file holds is what was applied, names and all
      assertNonNullable(
        watched.simAws
          .s3()
          .getSimBucketByName(accountScopedName("site-uploads")),
      );
    } finally {
      watched.stop();
    }
  });
});
