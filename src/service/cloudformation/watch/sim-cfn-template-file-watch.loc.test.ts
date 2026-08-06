import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { SimCfnTemplateFileWatch } from "./sim-cfn-template-file-watch.js";
import {
  putSitePage,
  sitePage,
  siteTemplate,
  templatePause,
  WatchedTemplate,
} from "../../../../test/cloudformation/watched-template.js";

describe("a deployed template file that changes", () => {
  it("goes on watching when applying a change throws", async () => {
    // Given a watch whose change handler fails outright, rather than answering
    // a failed update the way the update itself does
    const directory = new TemporaryDirectory();
    await directory.writeFile("Site.template.json", "{}");
    await templatePause(250);

    const applied: string[] = [];
    const watch = new SimCfnTemplateFileWatch({
      templatePath: directory.join("Site.template.json"),
      settleMs: 100,
      onChanged: async (): Promise<void> => {
        applied.push("applied");

        await Promise.resolve();

        throw new Error("the watch itself is broken");
      },
    });
    watch.start();

    try {
      // When the file is written twice, the second time after the first throw
      await directory.writeFile("Site.template.json", '{"Resources":{}}');
      await templatePause(500);
      await directory.writeFile("Site.template.json", '{"Description":"a"}');
      await templatePause(500);

      // Then the second save is applied too, rather than being refused by a
      // queue the first one left rejected
      assertArrayEquals(applied, ["applied", "applied"]);
    } finally {
      watch.close();
    }
  });

  it("updates the Stack in place", async () => {
    // Given a Stack deployed from a watched template file, holding an Object
    const watched = await WatchedTemplate.of(siteTemplate());
    await putSitePage(watched.simAws);

    // Whatever runs on an update, such as reloading a page, sees the Stack as
    // it is by then
    let uploadsWhenUpdated = false;
    watched.whenUpdated(() => {
      uploadsWhenUpdated =
        watched.simAws.s3().getSimBucketByName("site-uploads") !== undefined;
    });

    try {
      // When the template is synthesized again with another Bucket in it
      await watched.write(siteTemplate({ withUploads: true }));
      await watched.updated();

      // Then the Bucket the change added is in simulated S3, and was already
      // there when the update was announced rather than when the write landed
      assertNonNullable(watched.simAws.s3().getSimBucketByName("site-uploads"));
      assertTrue(uploadsWhenUpdated);

      // And the Bucket it did not change still holds its Object, which is what
      // restarting the process for the change could not have done
      assertIdentical(await sitePage(watched.simAws), "<h1>Hello</h1>");
    } finally {
      watched.stop();
    }
  });

  it("makes one update out of a burst of writes", async () => {
    // Given a Stack deployed from a watched template file
    const watched = await WatchedTemplate.of(siteTemplate());

    try {
      // When it is written several times in a row, as one save does
      await watched.write(siteTemplate({ description: "one" }));
      await watched.write(siteTemplate({ description: "two" }));
      await watched.write(siteTemplate({ withUploads: true }));

      await watched.updated();
      await templatePause(200);

      // Then the Stack is updated once, to the template that was left there
      assertIdentical(watched.updateCount(), 1);
      assertNonNullable(watched.simAws.s3().getSimBucketByName("site-uploads"));
    } finally {
      watched.stop();
    }
  });

  it("leaves the Resources it did not reach serving when an update fails", async () => {
    // Given a Stack deployed from a watched template file, holding an Object,
    // and a Bucket outside the Stack with the name the change wants
    const watched = await WatchedTemplate.of(siteTemplate());
    await putSitePage(watched.simAws);
    await watched.simAws
      .s3()
      .createBucket({ input: { Bucket: "site-uploads" } });

    try {
      // When the changed template asks for a Bucket that cannot be created
      await watched.write(siteTemplate({ withUploads: true }));
      await watched.failedUpdates();

      // Then the reason is reported
      assertStringIncludes(
        watched.failed().at(0)?.message ?? "",
        "site-uploads",
      );

      // And the Resource the failed update never got to is still serving,
      // which a restart on a template that no longer deploys could not have
      // managed
      assertIdentical(await sitePage(watched.simAws), "<h1>Hello</h1>");
    } finally {
      watched.stop();
    }
  });
});
