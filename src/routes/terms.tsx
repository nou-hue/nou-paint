import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms of Use (draft) · Nou Paint" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of Use" updated="DRAFT · [DATE LAST UPDATED]">
      <h2>Who we are</h2>
      <p>
        [SELLER / TRADER FULL LEGAL NAME], [TRADING / REGISTERED ADDRESS]. Contact: [CONTACT EMAIL]
        {" "}[PHONE, IF ANY]. VAT: [VAT NUMBER, IF REGISTERED].
      </p>

      <h2>Free pages</h2>
      <p>The children’s collection and the sample pages are free to use, with no account and no payment.</p>

      <h2>Paid packs</h2>
      <ul>
        <li>A pack is a one-off purchase of the pages listed on the order screen: [PACK CONTENTS].</li>
        <li>It lasts [PRODUCT DURATION]. The total price, including VAT, is shown before you pay: [PRICE] [VAT STATEMENT].</li>
        <li>Only grown-ups may buy. Buying happens on Stripe’s page, after a “grown-ups only” check.</li>
        <li>Your pack is for your own household’s personal, non-commercial use on your devices.</li>
      </ul>

      <h2>Starting straight away and your 14-day right to cancel</h2>
      <p>
        You can normally cancel a digital purchase within 14 days. If you tick the box saying you want the
        pack to start immediately, it is unlocked at once and you lose that 14-day right to cancel once it
        has been unlocked for you. We keep a record of the box being ticked. [CONFIRM WORDING WITH SOLICITOR]
      </p>

      <h2>If something is wrong</h2>
      <p>
        This does not affect your legal rights under the Consumer Rights Act 2015. If a pack is faulty or not
        as described, tell us at [CONTACT EMAIL] and we will put it right, or refund you where the law says so.
        [REFUND POLICY]
      </p>
      <p>
        If you ask for a refund and we agree, the pack will be locked again on your devices.
      </p>

      <h2>Restoring a pack</h2>
      <p>
        Use “Restore a purchase” and the email you bought with. We send a one-time link that lasts 30
        minutes.
      </p>

      <h2>Our responsibility</h2>
      <p>[LIABILITY WORDING: a solicitor must write this section.]</p>

      <h2>Law</h2>
      <p>[GOVERNING LAW AND COURTS: a solicitor must confirm.]</p>
    </LegalPage>
  );
}
