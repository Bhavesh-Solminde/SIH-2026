import { prisma } from "../db.js";
import { log } from "../lib/logger.js";

/**
 * Express middleware: reads the session token from the bhaav_session cookie,
 * looks up recycler_session (checking expiry), and attaches req.recycler =
 * { id, name, email } for downstream handlers. Returns 401 if missing or expired.
 */
export async function requireSession(req, res, next) {
  try {
    const token = req.cookies?.bhaav_session;
    if (!token) {
      log.auth.debug("requireSession: no cookie on", req.path);
      return res.status(401).json({ error: "unauthenticated" });
    }

    const session = await prisma.recyclerSession.findUnique({
      where: { token },
      include: {
        account: {
          include: { recycler: { select: { id: true, name: true } } },
        },
      },
    });

    if (!session) {
      log.auth.warn("requireSession: token not found", { path: req.path });
      return res.status(401).json({ error: "unauthenticated" });
    }

    if (session.expiresAt < new Date()) {
      log.auth.warn("requireSession: session expired", { path: req.path, recycler: session.account?.recycler?.name });
      await prisma.recyclerSession.delete({ where: { token } }).catch(() => {});
      return res.status(401).json({ error: "session_expired" });
    }

    // An admin account has no recyclerId (schema.prisma: recycler_account.recycler_id
    // is nullable specifically so an admin is not forced to belong to a recycler).
    // req.actor is the general-purpose identity every route can read; req.recycler
    // stays exactly as it was for every existing recycler-scoped handler — null
    // only for an admin account, which never calls a /recycler/* route.
    const role = session.account.role ?? "RECYCLER";
    req.actor = {
      accountId: session.account.id,
      email: session.account.email,
      role,
      recyclerId: session.account.recycler?.id ?? null,
      recyclerName: session.account.recycler?.name ?? null,
    };
    req.recycler = session.account.recycler
      ? { id: session.account.recycler.id, name: session.account.recycler.name, email: session.account.email }
      : null;
    log.auth.debug("requireSession: ok", { role, recycler: req.recycler?.name ?? null, path: req.path });
    return next();
  } catch (err) {
    log.auth.error("requireSession error", err);
    return next(err);
  }
}
