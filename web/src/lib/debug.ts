// Lightweight debug logging gated behind VITE_DEBUG. No-op in production builds
// unless the flag is explicitly "true", so the calls are safe to leave in place.
const DEBUG = import.meta.env.VITE_DEBUG === "true"

export function dbg(...args: unknown[]): void {
  if (DEBUG) console.log("[arisa]", ...args)
}
