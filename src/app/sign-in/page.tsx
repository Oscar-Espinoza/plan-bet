import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { configuredProviderNames, requireAccount, signIn } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/api-request";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

const PROVIDER_LABEL: Record<string, string> = {
  github: "Continue with GitHub",
  google: "Continue with Google",
};

type Props = { searchParams: Promise<{ callbackUrl?: string }> };

export default async function Page({ searchParams }: Props) {
  const { callbackUrl: rawCallbackUrl } = await searchParams;
  const callbackUrl = safeCallbackUrl(rawCallbackUrl);

  const account = await requireAccount();
  if (account.ok) redirect(callbackUrl);

  const providers = configuredProviderNames();

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="display-title">Sign in</h1>
          <p className="page-description">
            Signing in gives you a free-to-play credit ledger for the wager
            simulator. The rest of the workspace works without one.
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="sign-in-heading">
        <div className="panel-header">
          <h2 className="panel-title" id="sign-in-heading">
            {providers.length ? "Choose a provider" : "Sign-in unavailable"}
          </h2>
        </div>
        {providers.length ? (
          <div className="panel-body flex flex-col gap-3">
            {providers.map((provider) => (
              <form
                key={provider}
                action={async () => {
                  "use server";
                  await signIn(provider, { redirectTo: callbackUrl });
                }}
              >
                <Button type="submit" className="w-full">
                  {PROVIDER_LABEL[provider] ?? `Continue with ${provider}`}
                </Button>
              </form>
            ))}
          </div>
        ) : (
          <div className="panel-body">
            <p className="muted">
              No sign-in provider is configured in this environment. The
              dashboard, watchlist, and activity views all work without an
              account — sign-in only unlocks the free-to-play credit ledger.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
