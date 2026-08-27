import type { SimS3KeyPrefixMetadata } from "../object/s3-key-prefix-metadata.js";

/**
 * Somewhere a reload can be sent, which in practice is a local server.
 *
 * Named by the shape rather than the class, so mounting a directory does not
 * drag the serving side of Yulin into a simulated S3 that is only being asked
 * to read files.
 */
export interface SimS3MountReloadTarget {
  reload(): void;
}

/**
 * What to do about a directory mounted into a Bucket, beyond serving it.
 */
export interface SimS3MountFilesystemOptions {
  /**
   * Reload connected browsers once writes into the directory stop.
   *
   * This is the local server, as `{ reload: srv }`. Without it the directory is
   * not watched at all, and a rebuild is a restart or a manual refresh.
   */
  readonly reload?: SimS3MountReloadTarget | undefined;

  /**
   * How long the writes have to stop for before the directory counts as
   * changed, in milliseconds.
   *
   * A site generator writes a whole tree of files, so a wait is what makes one
   * build one reload. The default suits a generator writing its output.
   */
  readonly settleMs?: number | undefined;

  /**
   * File extensions to serve in addition to the usual web ones.
   *
   * A mounted Bucket only serves files whose extension is on a cautious list —
   * the web's own types, and nothing else — so that pointing a Bucket at a
   * directory cannot be talked into reading whatever else is in it. A site
   * serving a data file of its own needs its extension named here: a pinyin
   * dictionary's `.freq`, a `.wasm` module, a `.parquet` table.
   *
   * Added to the list rather than replacing it, and a leading dot is optional.
   */
  readonly additionalFileExtensions?: readonly string[] | undefined;

  /**
   * System metadata to report for the Objects under a key prefix.
   *
   * A stored Object carries what S3 was told at upload time. A file carries
   * its bytes and its name, so a mounted Bucket has only the extension to go
   * on and describes every Object with a `content-type` and nothing else. This
   * is where the rest is declared.
   *
   * A CDK `BucketDeployment` into the same Bucket has already said what it
   * publishes, and a mount inherits that, so this is for what no deployment
   * covers and for answering differently on purpose. A declaration here goes
   * over an inherited one, header by header.
   *
   * `ContentEncoding` is the one a site can be broken without. A directory of
   * brotli files served with no `content-encoding` is bytes no browser can
   * decode, and a deployment that sets the header would have made them work:
   *
   * ```typescript
   * systemMetadata: [{ keyPrefix: "br/", metadata: { ContentEncoding: "br" } }]
   * ```
   *
   * Every declaration whose prefix the key starts with applies, in the order
   * they were given, so a later one wins where two name the same header. A
   * declared `ContentType` replaces the one guessed from the extension.
   */
  readonly systemMetadata?: readonly SimS3KeyPrefixMetadata[] | undefined;
}
