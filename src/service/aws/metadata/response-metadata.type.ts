export interface SimResponseMetadata {
  readonly httpStatusCode?: number;
  readonly requestId?: string;
  readonly extendedRequestId?: string;
  readonly cfId?: string;
  readonly attempts?: number;
  readonly totalRetryDelay?: number;
}
