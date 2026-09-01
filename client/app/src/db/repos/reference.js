/**
 * The cached copy of what /sync/bootstrap returned. Replaceable: if it were
 * lost the app re-fetches it. Everything here is READ by the pricing and
 * ranking path and never authored on the device.
 */
export async function replaceReference(db, snapshot) {
  await db.$transaction(async (tx) => {
    await tx.category.deleteMany();
    for (const c of snapshot.categories) {
      // eslint-disable-next-line no-await-in-loop
      await tx.category.create({
        data: {
          id: c.id,
          code: c.code,
          parentCode: c.parentCode ?? null,
          nameEn: c.nameEn,
          nameMr: c.nameMr,
          nameHi: c.nameHi,
          iconKey: c.iconKey,
          defaultUnit: c.defaultUnit,
          criticalMinerals: JSON.stringify(c.criticalMinerals ?? []),
        },
      });
    }

    await tx.recycler.deleteMany();
    for (const r of snapshot.recyclers) {
      // eslint-disable-next-line no-await-in-loop
      await tx.recycler.create({
        data: {
          id: r.id,
          name: r.name,
          address: r.address ?? null,
          lat: r.lat,
          lng: r.lng,
          district: r.district ?? null,
          phone: r.phone ?? null,
          authorizationStatus: r.authorizationStatus,
          validityTo: r.validityTo ?? null,
          serviceAreaKm: r.serviceAreaKm,
          pickupAvailable: Boolean(r.pickupAvailable),
          materialsAccepted: JSON.stringify(r.materialsAccepted ?? []),
        },
      });
    }

    await tx.rate.deleteMany();
    for (const r of snapshot.rates) {
      // eslint-disable-next-line no-await-in-loop
      await tx.rate.create({
        data: {
          recyclerId: r.recyclerId,
          categoryCode: r.categoryCode,
          unit: r.unit,
          price: r.price,
          validFrom: r.validFrom,
        },
      });
    }

    for (const [condition, factor] of Object.entries(snapshot.conditionFactors ?? {})) {
      // eslint-disable-next-line no-await-in-loop
      await tx.conditionFactor.upsert({
        where: { condition },
        update: { factor },
        create: { condition, factor },
      });
    }

    await tx.meta.upsert({
      where: { key: "last_sync" },
      update: { value: snapshot.serverTime },
      create: { key: "last_sync", value: snapshot.serverTime },
    });
  });
}

export async function loadReference(db) {
  const [categories, recyclers, rates] = await Promise.all([
    db.category.findMany({ orderBy: { code: "asc" } }),
    db.recycler.findMany(),
    db.rate.findMany(),
  ]);
  return {
    // Categories are mapped to the snake_case shape S2 and S3 read, so those
    // screens are untouched by the switch to Prisma. Recyclers keep camelCase
    // because rankRecyclers in @bhaav/core consumes them directly.
    categories: categories.map((c) => ({
      id: c.id,
      code: c.code,
      parent_code: c.parentCode,
      name_en: c.nameEn,
      name_mr: c.nameMr,
      name_hi: c.nameHi,
      icon_key: c.iconKey,
      default_unit: c.defaultUnit,
      criticalMinerals: JSON.parse(c.criticalMinerals),
    })),
    recyclers: recyclers.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      district: r.district,
      phone: r.phone,
      authorizationStatus: r.authorizationStatus,
      serviceAreaKm: r.serviceAreaKm,
      pickupAvailable: Boolean(r.pickupAvailable),
      materialsAccepted: JSON.parse(r.materialsAccepted),
    })),
    rates: rates.map((r) => ({
      recyclerId: r.recyclerId,
      categoryCode: r.categoryCode,
      unit: r.unit,
      price: r.price,
      validFrom: r.validFrom,
    })),
  };
}

/**
 * Age of the freshest cached rate, in whole days. Drives the staleness strip:
 * over 3 days the date is greyed, over 14 an amber strip appears — and the
 * values are still shown either way (FRONTEND.md section 3).
 */
export async function rateAgeDays(db) {
  const rows = await db.rate.findMany({
    select: { validFrom: true },
    orderBy: { validFrom: "desc" },
    take: 1,
  });
  if (rows.length === 0) return null;
  return Math.floor((Date.now() - new Date(rows[0].validFrom).getTime()) / 86_400_000);
}
