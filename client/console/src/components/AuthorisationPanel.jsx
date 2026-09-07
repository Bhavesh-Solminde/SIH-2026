"use client";

/**
 * AuthorisationPanel — the filtering, made visible.
 *
 * Every recycler an operator or collector ever sees is already
 * `authorizationStatus: VALID`, so a tick on any one of them says nothing —
 * everything on screen is verified by construction. What is demonstrable is
 * the filtering itself: how many facilities the MPCB register carries, and
 * how many the app currently refuses to route a collector to. All numbers
 * here come straight from the `authorisation` prop (GET /public/authorisation)
 * — never hardcoded, so this can never drift from what the app actually does.
 *
 * Honesty rule (README.md ground rule 1): `LAPSED_IN_LIST` is not the same
 * as unlawful. It means the published MPCB record shows an expired validity
 * date — many such businesses will have renewed without MPCB republishing
 * the list. This panel names real businesses' regulatory status from a
 * public register, so it must never say or imply "illegal", "unauthorised
 * operator" or "banned" — only that a lapsed listing is hidden from the app.
 */
export default function AuthorisationPanel({ authorisation }) {
  if (!authorisation || !authorisation.listed) return null;

  const { listed, valid, lapsed, hiddenFromApp } = authorisation;
  const source = authorisation.source ?? {};
  const excluded = lapsed ?? hiddenFromApp;

  return (
    <section data-testid="authorisation-panel" aria-label="Authorisation evidence">
      <p>
        {valid} of {listed} MPCB-listed facilities are currently authorised. {excluded} have
        lapsed in the published list and are hidden from the app.
      </p>
      {source.fetchedOn && (
        <p>
          Source: {source.authority ?? "MPCB"}
          {source.list ? ` — ${source.list}` : ""}. List last refreshed {source.fetchedOn}
          {typeof authorisation.sourceAgeDays === "number"
            ? ` (${authorisation.sourceAgeDays}d ago)`
            : ""}
          .
        </p>
      )}
    </section>
  );
}
