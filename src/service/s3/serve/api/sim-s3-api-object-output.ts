import {
  xmlDocument,
  xmlElement,
  xmlValue,
} from "../../../../util/xml/xml-writer.js";
import { simS3ObjectResponseHeaders } from "../../object/s3-object-response-headers.js";
import { simS3SystemMetadataHeadersFrom } from "../../object/s3-system-metadata-read.js";

interface CopyObjectOutput {
  readonly CopyObjectResult?:
    | { readonly ETag?: string; readonly LastModified?: Date }
    | undefined;
}

/**
 * Write a finished copy as the document real S3 answers it with.
 *
 * A copy says nothing in its headers about the Object it wrote, so a client
 * reads the new ETag and write time out of this body and nowhere else.
 */
export function simS3CopyObjectXml(output: CopyObjectOutput): string {
  const result = output.CopyObjectResult ?? {};

  return xmlDocument(
    "CopyObjectResult",
    xmlValue("ETag", result.ETag) +
      xmlValue("LastModified", result.LastModified),
  );
}

interface TagSetOutput {
  readonly TagSet?: readonly {
    readonly Key?: string;
    readonly Value?: string;
  }[];
}

/**
 * Write the tags on an Object as the document real S3 answers them with.
 *
 * An Object nobody has tagged answers with an empty `TagSet` element rather
 * than none at all, which is what tells a client the Object exists and carries
 * no tags.
 */
export function simS3ObjectTaggingXml(output: TagSetOutput): string {
  return xmlDocument(
    "Tagging",
    xmlElement(
      "TagSet",
      (output.TagSet ?? [])
        .map((tag) =>
          xmlElement(
            "Tag",
            xmlValue("Key", tag.Key) + xmlValue("Value", tag.Value),
          ),
        )
        .join(""),
    ),
  );
}

/**
 * Answer a read with the Object itself, headers and all.
 *
 * The headers the read named in its `response-` parameters are served in place
 * of the Object's own, leaving what the Object was written with alone.
 *
 * A read that asked for part of the Object is answered `206 Partial Content`
 * and says which part it carries, because a client reading a large Object in
 * pieces at once writes each response at the offset it asked for, and a `200`
 * carrying the whole Object would be written over its neighbours.
 */
export async function simS3GetObjectResponse(
  output: Record<string, unknown>,
  overrides: Readonly<Record<string, string>>,
): Promise<Response> {
  const body = await objectBodyBytes(output["Body"]);
  const contentRange = output["ContentRange"] as string | undefined;

  return new Response(body, {
    status: contentRange === undefined ? 200 : 206,
    headers: simS3ObjectResponseHeaders({
      metadata: simS3SystemMetadataHeadersFrom(output),
      userMetadata: output["Metadata"] as Record<string, string> | undefined,
      overrides,
      bodyLength: body.length,
      etag: output["ETag"] as string | undefined,
      lastModified: output["LastModified"] as Date | undefined,
      contentRange,
      storageClass: output["StorageClass"] as string | undefined,
      serverSideEncryption: output["ServerSideEncryption"] as
        | string
        | undefined,
    }),
  });
}

/**
 * Read a GetObject body into the bytes an HTTP response carries.
 */
async function objectBodyBytes(body: unknown): Promise<Buffer> {
  /* v8 ignore if -- the loader always answers with a body */
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];

  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
