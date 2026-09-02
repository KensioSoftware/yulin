import {
  xmlDocument,
  xmlElement,
  xmlValue,
} from "../../../../util/xml/xml-writer.js";

interface BucketSummary {
  readonly Name?: string | undefined;
  readonly CreationDate?: Date | undefined;
}

interface ObjectSummary {
  readonly Key?: string | undefined;
  readonly Size?: number | undefined;
  readonly ETag?: string | undefined;
  readonly LastModified?: Date | undefined;
  readonly StorageClass?: string | undefined;
}

interface CommonPrefix {
  readonly Prefix?: string | undefined;
}

interface ListObjectsOutput {
  readonly Contents?: readonly ObjectSummary[] | undefined;
  readonly CommonPrefixes?: readonly CommonPrefix[] | undefined;
  readonly Name?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly Delimiter?: string | undefined;
  readonly MaxKeys?: number | undefined;
  readonly IsTruncated?: boolean | undefined;
  readonly KeyCount?: number | undefined;
  readonly ContinuationToken?: string | undefined;
  readonly NextContinuationToken?: string | undefined;
  readonly StartAfter?: string | undefined;
  readonly Marker?: string | undefined;
  readonly NextMarker?: string | undefined;
  readonly EncodingType?: string | undefined;
}

interface ListBucketsOutput {
  readonly Buckets?: readonly BucketSummary[] | undefined;
  readonly ContinuationToken?: string | undefined;
  readonly Prefix?: string | undefined;
}

/**
 * Write a bucket listing as the document real S3 answers ListBuckets with.
 */
export function simS3ListBucketsXml(output: ListBucketsOutput): string {
  const buckets = (output.Buckets ?? [])
    .map((bucket) =>
      xmlElement(
        "Bucket",
        xmlValue("Name", bucket.Name) +
          xmlValue("CreationDate", bucket.CreationDate),
      ),
    )
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
 *
 * The keys arrive encoded or not according to what the listing was asked for,
 * so nothing is encoded here. `EncodingType` says which of the two a client is
 * reading, and is absent from a listing that asked for no encoding.
 */
export function simS3ListObjectsXml(
  output: ListObjectsOutput,
  version: 1 | 2,
): string {
  const contents = (output.Contents ?? []).map(objectSummaryXml).join("");
  const commonPrefixes = (output.CommonPrefixes ?? [])
    .map((commonPrefix) =>
      xmlElement("CommonPrefixes", xmlValue("Prefix", commonPrefix.Prefix)),
    )
    .join("");

  return xmlDocument(
    "ListBucketResult",
    xmlValue("Name", output.Name) +
      xmlValue("Prefix", output.Prefix) +
      xmlValue("Delimiter", output.Delimiter) +
      xmlValue("EncodingType", output.EncodingType) +
      xmlValue("MaxKeys", output.MaxKeys) +
      xmlValue("IsTruncated", output.IsTruncated ?? false) +
      pagingXml(output, version) +
      contents +
      commonPrefixes,
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
