"use client";

import { NavigationLink as Link } from "@/components/fast-link";
import { ChevronRight, UsersRound } from "lucide-react";
import { useTranslation } from "@/components/language-provider";

export function GroupList({
  groups,
}: {
  groups: { id: string; name: string; slug: string; role: string }[];
}) {
  const { t } = useTranslation();
  return (
    <div className="group-list">
      {groups.map((group) => (
        <Link
          className="group-card"
          href={`/groups/${group.slug}`}
          preview={{ groupName: group.name }}
          key={group.id}
        >
          <span className="group-card-icon">
            <UsersRound aria-hidden="true" />
          </span>
          <span className="group-card-copy">
            <span className="group-card-name">{group.name}</span>
            <span className="fine-print">
              {group.role === "owner"
                ? t("You created this group.")
                : t("Member.")}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="group-card-chevron" />
        </Link>
      ))}
    </div>
  );
}
