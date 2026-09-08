import { Router } from "express";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { verifyPassword } from "../lib/password.js";
import { requireSession } from "../middleware/requireSession.js";
import { log } from "../lib/logger.js";

export const authRouter = Router();

const COOKIE = "bhaav_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cookieOpts() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    maxAge: SESSION_TTL_MS,
  };
}

// POST /auth/login
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    log.auth.info("login attempt", { email });

    if (!email || !password) {
      log.auth.warn("login rejected: missing fields");
      return res.status(400).json({ error: "email_and_password_required" });
    }

    const account = await prisma.recyclerAccount.findUnique({
      where: { email },
      include: { recycler: { select: { id: true, name: true } } },
    });

    const valid = account
      ? await verifyPassword(password, account.passwordHash)
      : false;

    if (!valid) {
      log.auth.warn("login failed: invalid credentials", { email });
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await prisma.recyclerSession.create({
      data: { token, accountId: account.id, expiresAt },
    });

    // account.recycler is null for an admin account (recyclerId is nullable —
    // see middleware/requireSession.js). This used to dereference it
    // unconditionally, which meant an admin account could never log in at
    // all — this is that fix.
    log.auth.info("login success", { email, role: account.role, recycler: account.recycler?.name ?? null });
    res.cookie(COOKIE, token, cookieOpts());
    return res.json({
      recycler_id: account.recycler?.id ?? null,
      name: account.recycler?.name ?? null,
      email: account.email,
      role: account.role,
    });
  } catch (err) {
    log.auth.error("login error", err);
    return next(err);
  }
});

// POST /auth/logout
authRouter.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      await prisma.recyclerSession.delete({ where: { token } }).catch(() => {});
      log.auth.info("logout", { tokenPrefix: token.slice(0, 8) });
    }
    res.clearCookie(COOKIE);
    return res.json({ ok: true });
  } catch (err) {
    log.auth.error("logout error", err);
    return next(err);
  }
});

// GET /auth/me
authRouter.get("/me", requireSession, async (req, res, next) => {
  try {
    log.auth.debug("session check ok", { role: req.actor.role, recycler: req.recycler?.name ?? null });

    // mpcbVerified: true only for a recycler who is BOTH on the MPCB VALID
    // list AND has not had that trust badge revoked by an admin. The two are
    // independent columns on purpose (schema.prisma comment on
    // trust_badge_revoked) — an MPCB refresh never clears an admin's revoke.
    let mpcbVerified = null;
    if (req.recycler) {
      const r = await prisma.recycler.findUnique({
        where: { id: req.recycler.id },
        select: { authorizationStatus: true, trustBadgeRevoked: true },
      });
      mpcbVerified = r?.authorizationStatus === "VALID" && !r?.trustBadgeRevoked;
    }

    // req.recycler is null for an admin account (recyclerId is nullable — see
    // middleware/requireSession.js). Spread it first so `role` always wins if
    // a shape ever collides, and an admin session still gets a well-formed
    // object instead of null.
    return res.json({
      ...(req.recycler ?? {}),
      email: req.actor.email,
      role: req.actor.role,
      mpcbVerified,
    });
  } catch (err) {
    return next(err);
  }
});
