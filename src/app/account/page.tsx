import { redirect } from "next/navigation";

// Account and record now live at /you. A redirect keeps existing bookmarks
// working — cheaper than chasing every inbound link.
export default function Page() {
  redirect("/you");
}
