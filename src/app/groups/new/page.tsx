import { getTranslation } from "@/lib/locale-server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateGroupForm } from "@/components/create-group-form";
import { Card } from "@/components/ui/card";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return { title: t("New group") };
}

export default async function Page() {
  const { t } = await getTranslation();
  const account = await requireAccount();
  if (!account.ok) {
    if (account.reason === "unconfigured") redirect("/groups");
    redirect("/sign-in?callbackUrl=/groups/new");
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("Group wagers")}</p>
          <h1 className="display-title">{t("New group")}</h1>
        </div>
      </header>

      <Card title={t("Create a group")} titleId="new-group-heading">
        <CreateGroupForm />
      </Card>
    </>
  );
}
