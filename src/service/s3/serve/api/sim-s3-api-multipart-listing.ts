import {
  xmlDocument,
  xmlElement,
  xmlValue,
} from "../../../../util/xml/xml-writer.js";

interface MultipartUploadSummary {
  readonly Key?: string | undefined;
  readonly UploadId?: string | undefined;
  readonly Initiated?: Date | undefined;
  readonly StorageClass?: string | undefined;
}

interface ListMultipartUploadsOutput {
  readonly Bucket?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly Uploads?: readonly MultipartUploadSummary[] | undefined;
  readonly IsTruncated?: boolean | undefined;
}

interface UploadPartSummary {
  readonly PartNumber?: number | undefined;
  readonly ETag?: string | undefined;
  readonly Size?: number | undefined;
  readonly LastModified?: Date | undefined;
}

interface ListPartsOutput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly UploadId?: string | undefined;
  readonly Parts?: readonly UploadPartSummary[] | undefined;
  readonly StorageClass?: string | undefined;
  readonly IsTruncated?: boolean | undefined;
}

/**
 * The document listing the uploads a Bucket has in progress.
 */
export function simS3ListUploadsXml(
  output: ListMultipartUploadsOutput,
): string {
  const uploads = (output.Uploads ?? [])
    .map((upload) =>
      xmlElement(
        "Upload",
        xmlValue("Key", upload.Key) +
          xmlValue("UploadId", upload.UploadId) +
          xmlValue("Initiated", upload.Initiated) +
          xmlValue("StorageClass", upload.StorageClass),
      ),
    )
    .join("");

  return xmlDocument(
    "ListMultipartUploadsResult",
    xmlValue("Bucket", output.Bucket) +
      xmlValue("Prefix", output.Prefix) +
      xmlValue("IsTruncated", output.IsTruncated ?? false) +
      uploads,
  );
}

/**
 * The document listing the parts stored against one upload.
 */
export function simS3ListPartsXml(output: ListPartsOutput): string {
  const parts = (output.Parts ?? [])
    .map((part) =>
      xmlElement(
        "Part",
        xmlValue("PartNumber", part.PartNumber) +
          xmlValue("LastModified", part.LastModified) +
          xmlValue("ETag", part.ETag) +
          xmlValue("Size", part.Size),
      ),
    )
    .join("");

  return xmlDocument(
    "ListPartsResult",
    xmlValue("Bucket", output.Bucket) +
      xmlValue("Key", output.Key) +
      xmlValue("UploadId", output.UploadId) +
      xmlValue("StorageClass", output.StorageClass) +
      xmlValue("IsTruncated", output.IsTruncated ?? false) +
      parts,
  );
}
