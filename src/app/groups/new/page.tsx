import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateGroupForm } from "@/components/create-group-form";
import { Card } from "@/components/ui/card";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New group" };

export default async function Page() {
  const account = await requireAccount();
  if (!account.ok) {
    if (account.reason === "unconfigured") redirect("/groups");
    redirect("/sign-in?callbackUrl=/groups/new");
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Group wagers</p>
          <h1 className="display-title">New group</h1>
        </div>
      </header>

      <Card title="Create a group" titleId="new-group-heading">
        <CreateGroupForm />
      </Card>
    </>
  );
}
