/**
 * Feature flags for Phoenix Print.
 *
 * These flags let us temporarily hide in-progress modules from the UI without
 * deleting any screens, routes, navigation, or business logic. Flip a flag back
 * to `true` to restore the corresponding UI entries with no other code changes.
 */

/**
 * Controls visibility of the Library / Marketplace module and the features that
 * depend on it (Shopping Cart and Chat entry points).
 *
 * While `false`, the Cart and Chat icons/entries are hidden from the UI. The
 * underlying screens, routes, providers, and logic remain fully intact so deep
 * links keep working and the feature can be re-enabled instantly.
 */
export const LibraryEnabled = false;
