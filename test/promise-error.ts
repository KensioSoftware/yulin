/**
 * Take the Error a promise rejected with, for asserting on.
 */
export async function promiseError(promise: Promise<void>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new TypeError("Expected promise to reject with an Error", {
      cause: error,
    });
  }

  throw new Error("Expected promise to reject");
}
