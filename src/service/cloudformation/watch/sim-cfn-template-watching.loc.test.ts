import { assertArrayEquals, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  siteTemplate,
  templatePause,
  WatchedTemplate,
} from "../../../../test/cloudformation/watched-template.js";

describe("what a deployment watches", () => {
  it("reads the file once when the deployment does not watch it", async () => {
    // Given a Stack deployed from a template file without watching it
    const watched = await WatchedTemplate.of(siteTemplate(), false);

    // When the template is synthesized again
    await watched.write(siteTemplate({ withUploads: true }));
    await templatePause(300);

    // Then nothing picks it up, since a deployment has always been the one
    // time the file is read
    assertArrayEquals(
      [...watched.simAws.cloudFormation().watchedTemplateFiles()],
      [],
    );
    assertUndefined(watched.simAws.s3().getSimBucketByName("site-uploads"));
  });

  it("says which template files it is watching, until it stops", async () => {
    // Given a Stack deployed from a template file watched with nothing to do
    // afterwards
    const watched = await WatchedTemplate.of(siteTemplate(), true);
    const simCfn = watched.simAws.cloudFormation();

    // Then the file is named, so a `yulin watch` supervisor can leave it alone
    assertArrayEquals([...simCfn.watchedTemplateFiles()], [watched.path()]);

    // When the watching is stopped and the file changes afterwards
    watched.stop();
    await watched.write(siteTemplate({ withUploads: true }));
    await templatePause(300);

    // Then nothing is watched, and nothing is applied
    assertArrayEquals([...simCfn.watchedTemplateFiles()], []);
    assertUndefined(watched.simAws.s3().getSimBucketByName("site-uploads"));
  });
});
