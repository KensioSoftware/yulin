import { MappedFactory } from "@kensio/part-factory";
import { SimLambdaEnvironment } from "./sim-lambda-environment.js";

/**
 * What a test asks for when it wants a function environment.
 *
 * The declared variables are a plain object rather than the Map the
 * environment keeps, because that is how a test writes them and how
 * Environment.Variables arrives from the SDK.
 */
export interface SimLambdaEnvironmentInput {
  readonly functionName: string;
  readonly regionName: string;
  readonly memorySizeMb: number;
  readonly declaredVariables: Record<string, string>;
}

/**
 * Builds the environment one simulated Lambda function runs with.
 */
export const simLambdaEnvironmentFactory = new MappedFactory<
  SimLambdaEnvironmentInput,
  SimLambdaEnvironment
>(
  () => ({
    functionName: "greeter",
    regionName: "eu-west-2",
    memorySizeMb: 128,
    declaredVariables: {},
  }),
  (input) =>
    new SimLambdaEnvironment({
      functionName: input.functionName,
      regionName: input.regionName,
      memorySizeMb: input.memorySizeMb,
      declaredVariables: new Map(Object.entries(input.declaredVariables)),
    }),
);
