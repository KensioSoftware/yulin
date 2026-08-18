import {
  xmlDocument,
  xmlElement,
  xmlValue,
} from "../../../../util/xml/xml-writer.js";

interface ObjectSummary {
  readonly Key?: string | undefined;
  readonly Size?: number | undefined;
  readonly ETag?: string | undefined;
  readonly LastModified?: Date | undefined;
  readonly StorageClass?: string | undefined;
}

interface ListObjectsOutput {
  readonly Contents?: readonly ObjectSummary[] | undefined;
  readonly Name?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly MaxKeys?: number | undefined;
  readonly IsTruncated?: boolean | undefined;
  readonly KeyCount?: number | undefined;
  readonly ContinuationToken?: string | undefined;
  readonly NextContinuationToken?: string | undefined;
  readonly StartAfter?: string | undefined;
  readonly Marker?: string | undefined;
  readonly NextMarker?: string | undefined;
}

interface ListBucketsOutput {
  readonly Buckets?:
    | readonly { readonly Name?: string | undefined }[]
    | undefined;
  readonly ContinuationToken?: string | undefined;
  readonly Prefix?: string | undefined;
}

/**
 * Write a bucket listing as the document real S3 answers ListBuckets with.
 */
export function simS3ListBucketsXml(output: ListBucketsOutput): string {
  const buckets = (output.Buckets ?? [])
    .map((bucket) => xmlElement("Bucket", xmlValue("Name", bucket.Name)))
    .join("");

  return xmlDocument(
    "ListAllMyBucketsResult",
    xmlElement("Buckets", buckets) +
      xmlValue("Prefix", output.Prefix) +
      xmlValue("ContinuationToken", output.ContinuationToken),
  );
}

/**
 * Write an Object listing as the document real S3 answers with.
 *
 * Both listing versions answer in a `ListBucketResult`, and differ only in how
 * they say where the next page starts. The version is passed in because the
 * output alone cannot say which was asked for.
 */
export function simS3ListObjectsXml(
  output: ListObjectsOutput,
  version: 1 | 2,
): string {
  const contents = (output.Contents ?? []).map(objectSummaryXml).join("");

  return xmlDocument(
    "ListBucketResult",
    xmlValue("Name", output.Name) +
      xmlValue("Prefix", output.Prefix) +
      xmlValue("MaxKeys", output.MaxKeys) +
      xmlValue("IsTruncated", output.IsTruncated ?? false) +
      pagingXml(output, version) +
      contents,
  );
}

/**
 * The elements that say where a page started and where the next one does.
 */
function pagingXml(output: ListObjectsOutput, version: 1 | 2): string {
  if (version === 2) {
    return (
      xmlValue("KeyCount", output.KeyCount) +
      xmlValue("ContinuationToken", output.ContinuationToken) +
      xmlValue("NextContinuationToken", output.NextContinuationToken) +
      xmlValue("StartAfter", output.StartAfter)
    );
  }

  return (
    xmlValue("Marker", output.Marker) +
    xmlValue("NextMarker", output.NextMarker)
  );
}

/**
 * One Object in a listing.
 */
function objectSummaryXml(summary: ObjectSummary): string {
  return xmlElement(
    "Contents",
    xmlValue("Key", summary.Key) +
      xmlValue("LastModified", summary.LastModified) +
      xmlValue("ETag", summary.ETag) +
      xmlValue("Size", summary.Size) +
      xmlValue("StorageClass", summary.StorageClass ?? "STANDARD"),
  );
}
