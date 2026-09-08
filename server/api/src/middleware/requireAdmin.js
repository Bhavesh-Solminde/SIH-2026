import { log } from "../lib/logger.js";

/**
 * Runs after requireSession. 403s any account that isn't role: "ADMIN".
 *
 * There is no broader RBAC in this codebase (see requireSession.js) — this is
 * a single binary check, matching the existing binary check between "has a
 * session" and "doesn't". Admin is the first privileged actor the system has;
 * this is deliberately the smallest thing that could add one.
 */
export function requireAdmin(req, res, next) {
  if (!req.actor) {
    log.auth.warn("requireAdmin: no actor on request (requireSession not run first?)", { path: req.path });
    return res.status(401).json({ error: "unauthenticated" });
  }
  if (req.actor.role !== "ADMIN") {
    log.auth.warn("requireAdmin: forbidden", { path: req.path, role: req.actor.role });
    return res.status(403).json({ error: "forbidden" });
  }
  return next();
}
