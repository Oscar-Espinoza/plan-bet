import { Skeleton } from "@/components/ui/skeleton";

export default function YouLoading() {
  // panelCount must track /you's card count (Standing, Open wagers, Just
  // settled, Slices) — doc 05 lifts Balance/Record into the page header and
  // will likely drop this to 3, update this alongside that change.
  return (
    <Skeleton label="Loading your record" variant="record" panelCount={4} />
  );
}
