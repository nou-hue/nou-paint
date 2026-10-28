import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { ExternalLink } from "@/components/ExternalLink";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Notice (draft) · Nou Paint" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy Notice" updated="DRAFT · [DATE LAST UPDATED]">
      <p>
        Nou Paint is a colouring app. Children can use it with no account, no sign-in and no personal
        details of any kind.
      </p>

      <h2>Who we are</h2>
      <p>
        [CONTROLLER LEGAL NAME], [TRADING / REGISTERED ADDRESS]. Contact: [CONTACT EMAIL].
        ICO registration: [ICO REGISTRATION NUMBER].
      </p>

      <h2>Children’s pages</h2>
      <ul>
        <li>We collect nothing about children. There are no accounts, adverts, analytics or trackers.</li>
        <li>
          Nothing leaves your device while colouring: the app loads only its own fonts, images and code from
          nou-paint itself, not from third parties.
        </li>
        <li>
          Your colouring progress and your choice of “Children” or “Adults” are saved only in your browser’s
          local storage on your device. We cannot see them. Clearing site data removes them.
        </li>
        <li>
          If you upload your own picture, it is turned into a grid inside your browser. It is never sent to us.
        </li>
      </ul>

      <h2>Grown-ups who buy a pack</h2>
      <p>Buying is for grown-ups only, behind a “grown-ups only” check. If you buy:</p>
      <ul>
        <li>
          Payment is taken by Stripe on Stripe’s own page. We never see or store your card number. Stripe gives us
          your email address, the amount paid and a payment reference.
        </li>
        <li>
          We keep your purchase on a Stripe customer record (your email, the pack you own, when you agreed to
          start straight away, and the version of that wording). We use it to unlock your pack, to restore it,
          to email your confirmation and restore links (sent via Resend), and to handle refunds and disputes.
        </li>
        <li>
          Legal basis: performing our contract with you, and our legal obligations for accounts and consumer
          law. [CONFIRM WITH SOLICITOR]
        </li>
        <li>Keep for: [RETENTION PERIOD]. Stripe and Resend act as our processors or independent controllers
          as described in their own notices.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        Children who only colour get no cookies from us. Only if a grown-up starts a purchase or restores
        one, we set two strictly necessary cookies: one to link the checkout to your browser, one to prove you
        own the pack for 10 minutes at a time. They are not used for tracking, so no cookie banner is needed
        for them. [CONFIRM WITH SOLICITOR]
      </p>

      <h2>Our hosting</h2>
      <p>
        The site runs on Vercel. Like any web host, it handles your IP address and request details to deliver
        pages and keep the service secure. We do not use this to profile anyone. [CONFIRM HOSTING REGION AND TRANSFER SAFEGUARDS]
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete your data, or object to how we use it, by writing to [CONTACT EMAIL].
        You can also complain to the Information Commissioner’s Office:{" "}
        <ExternalLink href="https://ico.org.uk/make-a-complaint/" className="inline-flex min-h-11 items-center text-gold-deep underline">
          ico.org.uk (grown-ups only)
        </ExternalLink>
        .
      </p>
    </LegalPage>
  );
}
