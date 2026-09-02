import { faker } from "@faker-js/faker";
import { DynamicFactory } from "@kensio/part-factory";

/**
 * A CORS configuration whose lists are mutable. That is the shape the AWS
 * SDK's own command input takes, so a test can hand what this factory makes
 * straight to a `CreateFunctionUrlConfigCommand`.
 */
export interface SimLambdaFunctionUrlCorsParts {
  AllowCredentials: boolean;
  AllowHeaders: string[];
  AllowMethods: string[];
  AllowOrigins: string[];
  ExposeHeaders: string[];
  MaxAge: number;
}

/**
 * Makes a valid Function URL CORS configuration, so a test states only the
 * part of it the test is about.
 *
 * The default allows one named Origin. That is the case where the headers
 * served depend on the request that asked for them.
 */
export const simLambdaFunctionUrlCorsFactory =
  new DynamicFactory<SimLambdaFunctionUrlCorsParts>(() => ({
    AllowCredentials: false,
    AllowHeaders: ["content-type"],
    AllowMethods: ["GET"],
    AllowOrigins: [`https://${faker.internet.domainName()}`],
    ExposeHeaders: ["x-request-id"],
    MaxAge: faker.number.int({ min: 1, max: 86_400 }),
  }));
