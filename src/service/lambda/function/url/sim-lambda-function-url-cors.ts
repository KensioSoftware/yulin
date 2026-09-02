/**
 * The cross-origin resource sharing settings of one Function URL.
 *
 * The member names are AWS's own. What `GetFunctionUrlConfig` reports is the
 * record `CreateFunctionUrlConfig` was given.
 *
 * https://docs.aws.amazon.com/lambda/latest/api/API_Cors.html
 */
export interface SimLambdaFunctionUrlCors {
  readonly AllowCredentials?: boolean | undefined;
  readonly AllowHeaders?: readonly string[] | undefined;
  readonly AllowMethods?: readonly string[] | undefined;
  readonly AllowOrigins?: readonly string[] | undefined;
  readonly ExposeHeaders?: readonly string[] | undefined;
  readonly MaxAge?: number | undefined;
}
