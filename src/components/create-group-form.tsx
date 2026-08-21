"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      setError(text || "The group was not created. Try again.");
      return;
    }
    const payload = (await response.json()) as {
      data: { group: { slug: string } };
    };
    router.push(`/groups/${payload.data.group.slug}`);
  };

  return (
    <form className="side-form" onSubmit={submit}>
      <label htmlFor="group-name" className="field-label">
        Group name
      </label>
      <input
        id="group-name"
        className="field"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={80}
        required
      />

      {error && (
        <Banner tone="negative" role="alert">
          {error}
        </Banner>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={pending || !name.trim()}
      >
        Create group
      </Button>
    </form>
  );
}
