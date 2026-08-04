/**
 * The names and object keys the simulated image pipeline is built from.
 *
 * The pipeline is one small application spread over several AWS services, so
 * its names are shared between the parts that create the resources, the
 * function code that uses them, and the tests that assert on them. Keeping them
 * in one module is what stops those three drifting apart.
 */

export const mediaBucketName = "image-uploads";
export const mediaTableName = "ImageUploads";
export const mediaQueueName = "screened-images";
export const mediaUserPoolName = "image-app-users";
export const mediaAppClientName = "web";
export const mediaApiName = "images";

/**
 * The Parameter Store name the rendition widths are configured under.
 */
export const renditionWidthsParameterName = "/images/live/rendition-widths";

/**
 * The widths that parameter holds, which is how many renditions an accepted
 * upload produces.
 */
export const renditionWidths = [320, 640] as const;

/**
 * Uploads land under this prefix, which is the one the screening function is
 * notified for.
 */
export const incomingPrefix = "incoming/";

/**
 * Screened uploads are copied under this prefix, which is the one the queue is
 * notified for.
 */
export const screenedPrefix = "screened/";

/**
 * Where an upload sits while it is waiting to be screened.
 */
export function incomingKey(userId: string, uploadId: string): string {
  return `${incomingPrefix}${userId}/${uploadId}`;
}

/**
 * Where an upload is copied to once it has passed screening, which is the
 * event the rest of the pipeline runs from.
 */
export function screenedKey(userId: string, uploadId: string): string {
  return `${screenedPrefix}${userId}/${uploadId}`;
}

/**
 * The prefix holding every rendition built from one upload.
 */
export function renditionPrefix(userId: string, uploadId: string): string {
  return `renditions/${userId}/${uploadId}/`;
}

/**
 * One rendition of one upload, at one width.
 */
export function renditionKey(
  userId: string,
  uploadId: string,
  width: number,
): string {
  return `${renditionPrefix(userId, uploadId)}${String(width)}`;
}

/**
 * The rendition a user has chosen to publish, which is a single key per user
 * rather than one per upload, so publishing again replaces it.
 */
export function publishedKey(userId: string): string {
  return `published/${userId}`;
}
