/**
 * Host half of the 「今天吃什么」 bundle.
 *
 * The feature is entirely a Web UI surface: client.js registers a floating,
 * freely draggable window in the `shell.overlay` slot. The Host row exists so
 * the package is a normal Cordis plugin that the profile can load, enable and
 * disable; it declares no services and holds no state.
 */
export function apply() {}
