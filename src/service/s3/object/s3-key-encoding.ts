/**
 * An Object key in the encoded form S3 hands one back in.
 *
 * S3 form-URL-encodes a key, so a space becomes a plus sign, while the slashes
 * that make up a key prefix stay as they are. An event notification record
 * carries a key this way, and so does a listing that asked for one.
 *
 * The encoding is what lets a key hold a character XML cannot carry. An
 * unencoded key holding a control character is a document no parser will read,
 * which is the reason `EncodingType` exists.
 */
export function simS3EncodedKey(key: string): string {
  return encodeURIComponent(key).replaceAll("%20", "+").replaceAll("%2F", "/");
}
