import {
  hasSendPatch,
  installSendPatch,
  type SimSdkSendHandler,
} from "../send-patch.js";

/**
 * A static method of an SDK client class, called through a wrapper.
 */
type SimSdkStaticMethod = (...arguments_: unknown[]) => unknown;

/**
 * The wrapped static methods of one intercepted SDK client class.
 *
 * A static factory such as `DynamoDBDocumentClient.from` constructs from the
 * class binding it closes over rather than through the class the calling code
 * holds, so the client it builds is never seen by the interception's construct
 * trap. Wrapping the method send-patches that client on the way back out.
 *
 * Each method is wrapped once, so the class keeps handing out the same
 * function for the same static.
 */
export class SimSdkStaticClientFactories {
  private readonly sendHandler: SimSdkSendHandler;
  private readonly wrappers = new WeakMap<object, unknown>();

  constructor(sendHandler: SimSdkSendHandler) {
    this.sendHandler = sendHandler;
  }

  /**
   * The patching wrapper for one static method.
   */
  wrap(method: object): unknown {
    const wrapped = this.wrappers.get(method) ?? this.wrapMethod(method);
    this.wrappers.set(method, wrapped);
    return wrapped;
  }

  /**
   * A Proxy rather than a plain function keeps the method's own identity
   * surface, such as its name, length and any properties hung off it.
   */
  private wrapMethod(method: object): unknown {
    const sendHandler = this.sendHandler;
    return new Proxy(method as SimSdkStaticMethod, {
      apply(
        target: SimSdkStaticMethod,
        thisArgument: unknown,
        callArguments: unknown[],
      ): unknown {
        const result: unknown = Reflect.apply(
          target,
          thisArgument,
          callArguments,
        );
        if (isUnpatchedClient(result)) {
          installSendPatch(result, sendHandler);
        }
        return result;
      },
    });
  }
}

/**
 * Whether a static method's return value is a client still to be patched.
 *
 * A factory building through the intercepted class itself has already been
 * patched by the construct trap, so patching again is skipped rather than
 * rejected as a double interception.
 */
function isUnpatchedClient(value: unknown): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (typeof (value as { send?: unknown }).send !== "function") {
    return false;
  }
  return !hasSendPatch(value);
}
