import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="damask grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="font-script text-5xl text-gold-deep">Nou Paint</p>
          <h1 className="mt-3 font-display text-3xl">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Save work and unlock adult downloads.</p>
        </div>
        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Link to="/" className="inline-block text-sm text-gold-deep underline-offset-4 hover:underline">
          Back
        </Link>
      </div>
    </main>
  );
}
