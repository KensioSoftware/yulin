import {
  assertArrayEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimAwsLocalServer } from "../../../serve/http/local-server/sim-aws-local-server.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import {
  siteTemplate,
  templatePause,
  WatchedTemplate,
} from "../../../../test/cloudformation/watched-template.js";

describe("reloading the browser for a watched template file", () => {
  it("reloads once the Stack has caught up with the file", async () => {
    // Given a Stack deployed from a template file watched with somewhere to
    // reload
    const browser = new ReloadedBrowser();
    const watched = await WatchedTemplate.of(siteTemplate(), {
      reload: browser,
    });
    browser.watching(watched);

    try {
      // When the template is synthesized again with another Bucket in it
      await watched.write(siteTemplate({ withUploads: true }));
      await watched.updated();
      await templatePause(200);

      // Then the browser is reloaded once, and the Bucket the change added was
      // already there when it was, rather than only the write having landed
      assertArrayEquals(browser.uploadsWhenReloaded, [true]);
    } finally {
      watched.stop();
    }
  });

  it("leaves the browser where it is when an update fails", async () => {
    // Given a watched Stack, and a Bucket outside it with the name the change
    // is about to want
    const browser = new ReloadedBrowser();
    const watched = await WatchedTemplate.of(siteTemplate(), {
      reload: browser,
    });
    browser.watching(watched);
    await watched.simAws
      .s3()
      .createBucket({ input: { Bucket: "site-uploads" } });

    try {
      // When the changed template asks for a Bucket that cannot be created
      await watched.write(siteTemplate({ withUploads: true }));
      await watched.failedUpdates();
      await templatePause(200);

      // Then nothing is reloaded, since a browser should not be sent to a
      // Stack the update did not reach
      assertArrayEquals(browser.uploadsWhenReloaded, []);
    } finally {
      watched.stop();
    }
  });

  it("refuses a server that could never reload, as the watch is set up", async () => {
    // Given a local server serving without live reload
    const directory = new TemporaryDirectory();
    await directory.writeFile(
      "Site.template.json",
      jsonStringify(siteTemplate()),
    );
    const simAws = new SimAws();
    const srv = new SimAwsLocalServer({ simAws });

    // When a deployment asks that server to reload for the file it watches
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplateFile({
        templatePath: directory.join("Site.template.json"),
        watch: { reload: srv },
      });
    });

    // Then it is refused here, where the mistake was made, rather than on the
    // first change long after, and nothing is left watching for a reload that
    // was never going to arrive
    assertStringIncludes(error.message, "{ liveReload: true }");
    assertArrayEquals([...simAws.cloudFormation().watchedTemplateFiles()], []);
  });
});

/**
 * A browser the watch reloads, which says what the Stack held each time.
 *
 * A reload is only worth anything once the Resources the new template asked
 * for are there, so what a test wants to know is not that it happened but when
 * it happened.
 */
class ReloadedBrowser {
  readonly uploadsWhenReloaded: boolean[] = [];

  private watched: WatchedTemplate | undefined;

  watching(watched: WatchedTemplate): void {
    this.watched = watched;
  }

  reload(): void {
    this.uploadsWhenReloaded.push(
      this.watched?.simAws.s3().getSimBucketByName("site-uploads") !==
        undefined,
    );
  }
}
