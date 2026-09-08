/**
 * The write + notification pair behind a recycler's ACCEPT/REJECT of a
 * collector's asking rate — extracted so two call sites can share it exactly:
 *
 *   - POST /recycler/acceptances/:id/respond (routes/recycler.js) — the
 *     recycler explicitly taps Accept/Reject in the Incoming queue.
 *   - GET /lots/:reference_code (routes/lots.js) — scanning the collector's
 *     QR code to open Verify & Sign IS the acknowledgment: a recycler does
 *     not scan a lot they have no intention of inspecting, so the explicit
 *     Incoming-queue step is redundant once they have scanned it.
 *
 * Both call sites must produce identical results — same lot status
 * transition, same collector SMS — so this exists once instead of twice.
 */
import { prisma } from "../db.js";
import { referenceCodeFromUuid } from "@bhaav/core/ids";
import { sendSms, smsEnabled } from "./sms.js";
import { logger } from "./logger.js";

const smsLog = logger("sms");

/**
 * @param {object} params
 * @param {object} params.acceptance - an Acceptance row with `.lot` populated
 *   (needs at minimum lot.collectorId, lot.quantity, lot.unit,
 *   lot.category?.code — the same shape routes/recycler.js already fetches).
 * @param {"ACCEPT"|"REJECT"} params.canonical
 * @param {string} params.recyclerName - for the SMS text and log lines.
 */
export async function respondToAcceptance({ acceptance, canonical, recyclerName }) {
  const response = canonical === "ACCEPT" ? "ACKNOWLEDGED" : "DECLINED";

  // Accepting must update the acceptance AND move the lot to ACCEPTED in the
  // same transaction — POST /lots/:id/depart requires status ACCEPTED before
  // a collector can move it, so a recycler must never end up "confirmed"
  // against a lot record that still reads as unclaimed.
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.acceptance.update({
      where: { id: acceptance.id },
      data: { recyclerResponse: response, responseTs: new Date() },
    });
    if (canonical === "ACCEPT") {
      await tx.lot.update({
        where: { id: acceptance.lotId },
        data: { status: "ACCEPTED" },
      });
    }
    return row;
  });

  // Collector notification. Optional by construction: no contact row, no
  // message, no behaviour change. The contact lookup is a local DB read and
  // is awaited; the outbound Fast2SMS call is the third-party network hop,
  // fired after the update commits and never awaited — an SMS outage must
  // never cost a recycler their recorded response.
  if (smsEnabled()) {
    const lot = acceptance.lot;
    const contact = await prisma.collectorContact.findUnique({ where: { collectorId: lot.collectorId } });
    if (contact) {
      const referenceCode = referenceCodeFromUuid(lot.id ?? acceptance.lotId);
      const message = canonical === "ACCEPT"
        ? `Bhaav: ${recyclerName} confirmed your lot. ${lot.category?.code ?? ""} ${Number(lot.quantity)}${String(lot.unit).toLowerCase()}, ref ${referenceCode}. They are expecting you.`
        : `Bhaav: ${recyclerName} declined lot ${referenceCode}. Open the app to pick another recycler.`;
      void sendSms({ numbers: contact.phone, message })
        .then((result) => {
          if (!result.ok) smsLog.warn("collector notify not sent", { acceptanceId: acceptance.id, reason: result.reason });
        })
        .catch((err) => {
          smsLog.warn("collector notify failed", { acceptanceId: acceptance.id, reason: err?.message });
        });
    }
  }

  return updated;
}
