import { makeSimCloudFrontETag } from "../sim-cf-etag.js";

/**
 * The JavaScript runtime a CloudFront Function is written against.
 */
export type SimCloudFrontFunctionRuntime =
  | "cloudfront-js-1.0"
  | "cloudfront-js-2.0";

export interface SimCffConfigurationProperties {
  /** The `FunctionConfig` comment, which CloudFront requires and reports. */
  readonly comment?: string | undefined;
  /** The `FunctionConfig` runtime this Function is written against. */
  readonly runtime?: SimCloudFrontFunctionRuntime | undefined;
  /** The source this Function was created with, which GetFunction reports. */
  readonly functionCode?: Uint8Array | undefined;
  /** When this Function was created, off the simulation's clock. */
  readonly createdTime?: Date | undefined;
}

/**
 * What a CloudFront Function was created with, which every read of it reports.
 *
 * This is the `FunctionConfig` and `FunctionMetadata` pair the API answers
 * with, held together because they are written once at creation and read
 * together afterwards. The Function itself is what runs; this is what it says
 * about itself.
 */
export class SimCffConfiguration {
  public readonly comment: string;
  public readonly runtime: SimCloudFrontFunctionRuntime;
  public readonly functionCode: Uint8Array;

  /**
   * When this Function was created, and when it was last changed.
   *
   * They are the same instant here. What moves the modified time apart from
   * the created time in CloudFront is UpdateFunction and PublishFunction, and
   * neither is simulated yet.
   */
  public readonly createdTime: Date;
  public readonly lastModifiedTime: Date;

  /**
   * The version of this Function a write has to carry to be accepted.
   */
  public readonly etag: string = makeSimCloudFrontETag();

  constructor(properties: SimCffConfigurationProperties = {}) {
    this.comment = properties.comment ?? "";
    this.runtime = properties.runtime ?? "cloudfront-js-2.0";
    this.functionCode = properties.functionCode ?? new Uint8Array();
    this.createdTime = properties.createdTime ?? new Date();
    this.lastModifiedTime = this.createdTime;
  }
}
