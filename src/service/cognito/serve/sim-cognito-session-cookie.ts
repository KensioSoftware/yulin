import type { SimCognitoSessionChange } from "../command/hosted/sim-cognito-session-change.js";

/**
 * The name real managed login gives its session cookie.
 */
const cookieName = "cognito";

/**
 * How long the browser holds the cookie, which is the hour real Cognito gives
 * a managed login session.
 */
const cookieSeconds = 3600;

/**
 * The attributes every form of the cookie carries.
 *
 * Real Cognito sets this cookie `Secure`, and this simulation leaves that off,
 * because a user pool domain is served over http on localhost and a browser
 * sends a `Secure` cookie back over https alone.
 */
const cookieAttributes = "Path=/; HttpOnly; SameSite=Lax";

/**
 * The `cognito` cookie a browser carries its managed login session in.
 *
 * Reading it is what tells a returning browser from a new one, and setting it
 * is what makes the browser return. Both sit in the serving layer, because the
 * endpoints behind it take the session as a value and know nothing about
 * cookies.
 */
export class SimCognitoSessionCookie {
  /**
   * The managed login session a request carried, where it carried one.
   */
  read(request: Request): string | undefined {
    const header = request.headers.get("cookie");

    if (header === null) {
      return undefined;
    }

    for (const pair of header.split(";")) {
      const separator = pair.indexOf("=");

      if (separator === -1) {
        continue;
      }

      if (pair.slice(0, separator).trim() === cookieName) {
        return pair.slice(separator + 1).trim();
      }
    }

    return undefined;
  }

  /**
   * The `Set-Cookie` header a response carries, where the request changed the
   * browser's session.
   *
   * A sign-in the session itself answered sets nothing. Real Cognito leaves
   * the hour where the sign-in that started it put the hour, so a returning
   * browser keeps the cookie it already has.
   */
  headerFor(change: SimCognitoSessionChange): string | undefined {
    if (change.startedSession !== undefined) {
      return `${cookieName}=${change.startedSession}; ${cookieAttributes}; Max-Age=${String(cookieSeconds)}`;
    }

    if (change.endsSession) {
      return `${cookieName}=; ${cookieAttributes}; Max-Age=0`;
    }

    return undefined;
  }
}
