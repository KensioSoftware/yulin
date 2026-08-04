/**
 * An image as a Rekognition detection request names it.
 *
 * Every detection operation takes the same `Image` member, so it lives beside
 * the code that reads it rather than in one command's own types.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Image.html
 */
export interface SimRekognitionImageInput {
  readonly Bytes?: Uint8Array | undefined;
  readonly S3Object?: SimRekognitionS3ObjectInput | undefined;
}

/**
 * An S3 object as a Rekognition detection request names it.
 *
 * The object key is `Name` here rather than the `Key` every S3 command uses.
 */
export interface SimRekognitionS3ObjectInput {
  readonly Bucket?: string | undefined;
  readonly Name?: string | undefined;
  readonly Version?: string | undefined;
}
