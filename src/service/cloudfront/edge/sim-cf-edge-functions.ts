/**
 * The Lambda functions a simulated Distribution's Behaviors can run at the
 * edge.
 *
 * A `LambdaFunctionARN` can name any Account and Region, so the functions come
 * from the whole simulation rather than from the CloudFront service's own
 * scope. A standalone `SimCloudFront` built without one associates a function
 * by ARN and runs nothing, the same way it accepts a viewer certificate
 * without a simulated ACM to check it against.
 */
export interface SimCfEdgeFunctions {
  /**
   * Check the function can be associated, throwing when it cannot.
   *
   * Run when the Distribution is created or updated, which is when real
   * CloudFront checks it. A Behavior naming a function that is not there is
   * refused there rather than serving requests that quietly skip it.
   */
  assertAssociable(functionArn: string): Promise<void>;

  /**
   * Run the function for one edge event, answering with what it returned.
   */
  invoke(functionArn: string, event: object): Promise<unknown>;
}
