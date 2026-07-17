/**
 * Coordinates intentional post-login navigation vs. stale push deep-links.
 * Google OAuth remounts the JS tree; NotificationRegistrar must not steal the route.
 */

let suppressPushNavigationUntil = 0;

/** Call immediately before router.replace after a successful sign-in. */
export function markPostAuthNavigation(target: string): void {
  suppressPushNavigationUntil = Date.now() + 8000;
  console.log("[PostAuthNav] mark destination", {
    navigationTarget: target,
    suppressPushUntil: new Date(suppressPushNavigationUntil).toISOString(),
  });
}

export function shouldSuppressPushNavigation(): boolean {
  return Date.now() < suppressPushNavigationUntil;
}
