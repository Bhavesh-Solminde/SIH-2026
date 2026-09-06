import { prisma } from "../db.js";

// Buyer offer = the transaction-time snapshot stored on the acknowledged
// Acceptance for a lot, NOT the recycler's currently-published Rate.
//
// A recycler's Rate is a live market rate that can change after a lot has
// already been accepted. The accepted lot must keep the price it was
// accepted at so historical transactions stay auditable. Therefore this
// helper reads Acceptance.acceptedRate / Acceptance.acceptedUnit only, and
// never falls back to Rate.price.
const SOURCE_NAME = "ACCEPTANCE_SNAPSHOT";

export async function getBuyerOfferForLot(lotId, recyclerId) {
  const acceptance = await prisma.acceptance.findFirst({
    where: { lotId, recyclerId, recyclerResponse: "ACKNOWLEDGED" },
  });

  if (!acceptance) {
    return {
      price: null,
      unit: null,
      status: "NOT_FOUND",
      source: null,
    };
  }

  return {
    price: Number(acceptance.acceptedRate),
    unit: acceptance.acceptedUnit,
    status: "FOUND",
    source: SOURCE_NAME,
  };
}