/**
 * The green "MPCB verified" trust badge a recycler sees on login (GET
 * /auth/me → mpcbVerified) and an admin's ability to revoke it independently
 * of the underlying MPCB authorizationStatus (only mpcb-refresh.js ever
 * touches that column — see the trust_badge_revoked comment on the Recycler
 * model in schema.prisma).
 *
 * Deliberately its own router rather than an addition to routes/admin.js:
 * that file's GET /recyclers already exists for a different purpose (ranked
 * anomaly stats, not badge state) and this needed its own list shape.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { log } from "../lib/logger.js";

export const recyclerBadgeRouter = Router();

recyclerBadgeRouter.use(requireSession, requireAdmin);

// ---------------------------------------------------------------------------
// GET /recyclers/verified — every MPCB-VALID recycler and its current badge
// state, for the admin badges page.
// ---------------------------------------------------------------------------
recyclerBadgeRouter.get("/verified", async (req, res, next) => {
  try {
    const recyclers = await prisma.recycler.findMany({
      where: { authorizationStatus: "VALID" },
      select: { id: true, name: true, district: true, trustBadgeRevoked: true },
      orderBy: { name: "asc" },
    });

    return res.json({
      recyclers: recyclers.map((r) => ({
        id: r.id,
        name: r.name,
        district: r.district,
        badge_revoked: r.trustBadgeRevoked,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /recyclers/:id/badge — body: { revoked: boolean }
// ---------------------------------------------------------------------------
recyclerBadgeRouter.patch("/:id/badge", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { revoked } = req.body ?? {};

    if (typeof revoked !== "boolean") {
      return res.status(400).json({ error: "revoked_must_be_boolean" });
    }

    const recycler = await prisma.recycler.findUnique({ where: { id }, select: { id: true } });
    if (!recycler) {
      return res.status(404).json({ error: "not_found" });
    }

    // updatedAt is set explicitly here — the Recycler model has no @updatedAt
    // decorator (schema.prisma), so Prisma never bumps it on its own. GET
    // /sync/delta's "what changed since cursor" mechanism keys entirely off
    // this column; without setting it, a revoke would be invisible to that
    // path even though it filters on trustBadgeRevoked correctly.
    const updated = await prisma.recycler.update({
      where: { id },
      data: { trustBadgeRevoked: revoked, updatedAt: new Date() },
    });

    log.admin.info(revoked ? "admin revoked trust badge" : "admin restored trust badge", {
      recycler_id: id, admin: req.actor.email,
    });

    return res.json({ id: updated.id, badge_revoked: updated.trustBadgeRevoked });
  } catch (err) {
    return next(err);
  }
});
