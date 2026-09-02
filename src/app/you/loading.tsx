import { Skeleton } from "@/components/ui/skeleton";

export default function YouLoading() {
  // panelCount must track /you's card count. Doc 05 lifted Balance/Record
  // out of the Standing card into the page header, but the residual detail
  // (Hit rate, Net, Times reset) stayed a card of its own rather than
  // folding into Slices, so the count is still 4: Open wagers, Just
  // settled, Slices, Detail.
  return (
    <Skeleton label="Loading your record" variant="record" panelCount={4} />
  );
}
