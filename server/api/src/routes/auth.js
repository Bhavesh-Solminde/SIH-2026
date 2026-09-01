import { Router } from "express";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { verifyPassword } from "../lib/password.js";
import { requireSession } from "../middleware/requireSession.js";

export const authRouter = Router();

const COOKIE = "bhaav_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
  };
}

// POST /auth/login
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
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
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await prisma.recyclerSession.create({
      data: { token, accountId: account.id, expiresAt },
    });

    res.cookie(COOKIE, token, cookieOpts());
    return res.json({
      recycler_id: account.recycler.id,
      name: account.recycler.name,
      email: account.email,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/logout
authRouter.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      await prisma.recyclerSession.delete({ where: { token } }).catch(() => {});
    }
    res.clearCookie(COOKIE);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// GET /auth/me
authRouter.get("/me", requireSession, (req, res) => {
  return res.json(req.recycler);
});
