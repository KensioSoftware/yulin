/**
 * The SAM Resource type a function is declared as.
 *
 * It sits on its own so that what a function's events expand into can name the
 * Resource they were declared on without importing the expansion they are part
 * of.
 */
export const samFunctionType = "AWS::Serverless::Function";
