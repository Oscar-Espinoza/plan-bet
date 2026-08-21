import { redirect } from "next/navigation";

// History now lives at /you, with the same querystring contract
// (sport/outcome/range/scope/page). A redirect keeps existing bookmarks and
// filtered links working — cheaper than chasing every inbound link.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) {
      params.set(key, value[0]);
    }
  }
  const qs = params.toString();
  redirect(qs ? `/you?${qs}` : "/you");
}
