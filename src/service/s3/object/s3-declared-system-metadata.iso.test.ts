import { assertArrayLength, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3BucketSystemMetadata } from "../bucket/sim-s3-bucket-system-metadata.js";
import { SimS3DeclaredSystemMetadata } from "./s3-declared-system-metadata.js";
import { SimS3KeyPrefixDeclaration } from "./s3-key-prefix-metadata.js";
import type { SimS3SystemMetadataDeclaration } from "./s3-system-metadata-declaration.type.js";
import type { SimS3SystemMetadataValues } from "./s3-system-metadata.js";

/**
 * A declaration that knows what it published and the rule it published by,
 * which is the shape a CDK BucketDeployment leaves on a Bucket.
 */
class PublishedDeclaration implements SimS3SystemMetadataDeclaration {
  private readonly published: ReadonlySet<string>;
  private readonly keyPrefix: string;

  constructor(
    readonly metadata: SimS3SystemMetadataValues,
    published: readonly string[],
    keyPrefix = "",
  ) {
    this.published = new Set(published);
    this.keyPrefix = keyPrefix;
  }

  describes(objectKey: string): boolean {
    return this.published.has(objectKey);
  }

  wouldDescribe(objectKey: string): boolean {
    return objectKey.startsWith(this.keyPrefix);
  }
}

describe("SimS3DeclaredSystemMetadata", () => {
  it("declares system metadata for the Objects under a prefix", () => {
    // Given a compressed mirror published under its own prefix.
    const declared = new SimS3DeclaredSystemMetadata({
      declarations: [{ keyPrefix: "br/", metadata: { ContentEncoding: "br" } }],
    });

    // When an Object in the mirror is described.
    const headers = declared.headersForObjectKey("br/js/app.js");

    // Then it is reported as brotli, under the name a read returns it by.
    assertObjectEquals(headers, { "content-encoding": "br" });
  });

  it("leaves an Object outside the prefix undescribed", () => {
    // Given the same declaration.
    const declared = new SimS3DeclaredSystemMetadata({
      declarations: [{ keyPrefix: "br/", metadata: { ContentEncoding: "br" } }],
    });

    // When the uncompressed copy of the same file is described.
    const headers = declared.headersForObjectKey("js/app.js");

    // Then nothing is declared about it, so it is served as it is on disk.
    assertArrayLength(Object.keys(headers), 0);
  });

  it("declares every system metadata header a deployment can set", () => {
    // Given a declaration naming each of them.
    const declared = new SimS3DeclaredSystemMetadata({
      declarations: [
        {
          keyPrefix: "",
          metadata: {
            CacheControl: "public, max-age=31536000, immutable",
            ContentDisposition: 'inline; filename="app.js"',
            ContentEncoding: "br",
            ContentLanguage: "en-GB",
            ContentType: "text/javascript",
            Expires: "Sat, 02 Jan 2027 03:04:05 GMT",
          },
        },
      ],
    });

    // When an Object is described. An empty prefix is every key.
    const headers = declared.headersForObjectKey("anything.bin");

    // Then each one is reported under its header name.
    assertObjectEquals(headers, {
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": 'inline; filename="app.js"',
      "content-encoding": "br",
      "content-language": "en-GB",
      "content-type": "text/javascript",
      expires: "Sat, 02 Jan 2027 03:04:05 GMT",
    });
  });

  it("lets a later declaration win where two name the same header", () => {
    // Given a cache directive for the whole Bucket and a longer one for the
    // hashed assets in it.
    const declared = new SimS3DeclaredSystemMetadata({
      declarations: [
        { keyPrefix: "", metadata: { CacheControl: "max-age=60" } },
        {
          keyPrefix: "js/",
          metadata: { CacheControl: "max-age=31536000, immutable" },
        },
      ],
    });

    // When a hashed asset is described.
    const headers = declared.headersForObjectKey("js/app.F3H4LLPU.js");

    // Then the more specific declaration is the one reported.
    assertObjectEquals(headers, {
      "cache-control": "max-age=31536000, immutable",
    });
  });

  it("declares nothing when a mount says nothing", () => {
    // Given a mount that declared no metadata at all.
    const declared = new SimS3DeclaredSystemMetadata();

    // When an Object is described.
    const headers = declared.headersForObjectKey("index.html");

    // Then the Object is left to be described by its file extension alone.
    assertArrayLength(Object.keys(headers), 0);
  });

  it("inherits what the Bucket was already told", () => {
    // Given a Bucket a deployment has described a compressed mirror in.
    const inherited = new SimS3BucketSystemMetadata();
    inherited.declare(
      "deployment",
      new SimS3KeyPrefixDeclaration({
        keyPrefix: "br/",
        metadata: { ContentEncoding: "br" },
      }),
    );

    // And a mount over it that restates none of it.
    const declared = new SimS3DeclaredSystemMetadata({ inherited });

    // When an Object in the mirror is described.
    const headers = declared.headersForObjectKey("br/js/app.js");

    // Then the mount reports what the deployment publishes.
    assertObjectEquals(headers, { "content-encoding": "br" });
  });

  it("lets the mount lay its own declarations over the inherited ones", () => {
    // Given a Bucket told the whole site is cached for a year.
    const inherited = new SimS3BucketSystemMetadata();
    inherited.declare(
      "deployment",
      new SimS3KeyPrefixDeclaration({
        keyPrefix: "",
        metadata: {
          CacheControl: "public, max-age=31536000, immutable",
          ContentEncoding: "br",
        },
      }),
    );

    // And a mount that wants a rebuild to reach the page it is serving.
    const declared = new SimS3DeclaredSystemMetadata({
      inherited,
      declarations: [{ keyPrefix: "", metadata: { CacheControl: "no-store" } }],
    });

    // When an Object is described.
    const headers = declared.headersForObjectKey("index.html");

    // Then the mount has the last word on the header it named, and the one it
    // said nothing about is still the deployment's.
    assertObjectEquals(headers, {
      "cache-control": "no-store",
      "content-encoding": "br",
    });
  });

  it("reports what published an Object rather than what would have", () => {
    // Given a Bucket two deployments publish into at the same prefix, told
    // apart by what their own sources hold: the site, and a compressed data
    // directory the site's deployment leaves out.
    const inherited = new SimS3BucketSystemMetadata();
    inherited.declare(
      "site",
      new PublishedDeclaration({ CacheControl: "public, max-age=0" }, [
        "index.html",
      ]),
    );
    inherited.declare(
      "data",
      new PublishedDeclaration({ ContentEncoding: "br" }, [
        "data/standard.keys",
      ]),
    );

    // And a mount serving the same files from the build that made them.
    const declared = new SimS3DeclaredSystemMetadata({ inherited });

    // When each is described.
    // Then each carries the headers of the deployment that published it. Both
    // rules cover the page, and serving it as the other one's brotli would be
    // bytes the browser hands back unread.
    assertObjectEquals(declared.headersForObjectKey("index.html"), {
      "cache-control": "public, max-age=0",
    });
    assertObjectEquals(declared.headersForObjectKey("data/standard.keys"), {
      "content-encoding": "br",
    });
  });

  it("describes a file a rebuild added the way its deployment would have", () => {
    // Given a Bucket a deployment published a compressed mirror into.
    const inherited = new SimS3BucketSystemMetadata();
    inherited.declare(
      "mirror",
      new PublishedDeclaration(
        { ContentEncoding: "br" },
        ["br/js/app.js"],
        "br/",
      ),
    );

    // And a mount over the directory the build writes.
    const declared = new SimS3DeclaredSystemMetadata({ inherited });

    // When a page written since the deployment ran is described.
    const headers = declared.headersForObjectKey("br/js/new.js");

    // Then the deployment's own rule answers for it, because a file under the
    // mirror is a mirrored file whenever it was written.
    assertObjectEquals(headers, { "content-encoding": "br" });
  });

  it("declines to guess between two deployments that could have published it", () => {
    // Given the two deployments sharing a prefix again.
    const inherited = new SimS3BucketSystemMetadata();
    inherited.declare(
      "site",
      new PublishedDeclaration({ CacheControl: "public, max-age=0" }, [
        "index.html",
      ]),
    );
    inherited.declare(
      "data",
      new PublishedDeclaration({ ContentEncoding: "br" }, [
        "data/standard.keys",
      ]),
    );

    const declared = new SimS3DeclaredSystemMetadata({ inherited });

    // When a page neither of them published is described.
    const headers = declared.headersForObjectKey("about.html");

    // Then nothing is inherited for it. Either deployment's rule would take it,
    // and a page served as brotli it is not is worse than a page served as the
    // file on disk, which is what a mount does without any of this.
    assertArrayLength(Object.keys(headers), 0);
  });

  it("inherits a declaration made after the mount was set up", () => {
    // Given a directory mounted into a Bucket nothing has described yet, which
    // is a dev script that mounts before it deploys.
    const inherited = new SimS3BucketSystemMetadata();
    const declared = new SimS3DeclaredSystemMetadata({ inherited });

    // When the Stack is deployed afterwards.
    inherited.declare(
      "deployment",
      new SimS3KeyPrefixDeclaration({
        keyPrefix: "br/",
        metadata: { ContentEncoding: "br" },
      }),
    );

    // Then the mount reports what it was told, rather than what the Bucket had
    // to say for itself at the moment it was mounted.
    assertObjectEquals(declared.headersForObjectKey("br/js/app.js"), {
      "content-encoding": "br",
    });
  });
});
