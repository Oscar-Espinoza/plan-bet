<script lang="ts">
  import { createAuthClient } from "better-auth/svelte";
  import Breadcrumb from "#lib/components/breadcrumb.svelte";
  import StatusTag from "#lib/components/ui/status-tag.svelte";
  import SubmitButton from "#lib/components/ui/submit-button.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const i18n = useTranslation();
  const authClient = createAuthClient();

  const PROVIDER_LABEL: Record<string, string> = {
    github: "Continue with GitHub",
    google: "Continue with Google",
  };

  const ERROR_MESSAGE: Record<string, string> = {
    OAuthAccountNotLinked:
      "That account is already connected to a different Matchday Plan account. Sign in with the provider you used originally.",
    AccessDenied: "Sign-in was cancelled or refused by the provider.",
    Configuration: "Sign-in is misconfigured in this environment.",
  };
  const FALLBACK_ERROR_MESSAGE = "Sign-in did not complete. Try again.";

  async function signInWith(provider: "github" | "google") {
    await authClient.signIn.social({
      provider,
      callbackURL: data.callbackUrl,
    });
  }
</script>

<svelte:head>
  <title>{data.title} · Matchday Plan</title>
</svelte:head>

<header class="page-heading">
  <Breadcrumb items={[{ label: i18n.t("Sign in") }]} />
  <div>
    <p class="eyebrow">{i18n.t("Account")}</p>
    <h1 class="display-title">{i18n.t("Sign in")}</h1>
    <p class="page-description">
      {i18n.t(
        "Signing in gives you a free-to-play credit ledger for the wager simulator. The rest of the workspace works without one.",
      )}
    </p>
  </div>
</header>

{#if data.error}
  <section class="panel" role="alert">
    <div class="panel-body flex items-start gap-3">
      <StatusTag tone="warning">{i18n.t("Sign-in failed")}</StatusTag>
      <p class="muted">
        {i18n.t(ERROR_MESSAGE[data.error] ?? FALLBACK_ERROR_MESSAGE)}
      </p>
    </div>
  </section>
{/if}

<section class="panel" aria-labelledby="sign-in-heading">
  <div class="panel-header">
    <h2 class="panel-title" id="sign-in-heading">
      {data.providers.length
        ? i18n.t("Choose a provider")
        : i18n.t("Sign-in unavailable")}
    </h2>
  </div>
  {#if data.providers.length}
    <div class="panel-body flex flex-col gap-3">
      {#each data.providers as provider, index (provider)}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void signInWith(provider);
          }}
        >
          <SubmitButton
            class="w-full"
            variant={index === 0 ? "primary" : "secondary"}
            pendingLabel={i18n.t("Redirecting…")}
          >
            {i18n.t(PROVIDER_LABEL[provider] ?? `Continue with ${provider}`)}
          </SubmitButton>
        </form>
      {/each}
    </div>
  {:else}
    <div class="panel-body">
      <p class="muted">
        {i18n.t(
          "No sign-in provider is configured in this environment. The games board works without an account — sign-in only unlocks the free-to-play credit ledger.",
        )}
      </p>
    </div>
  {/if}
</section>
