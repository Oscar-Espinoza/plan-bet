"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * A server-action form's submit button that reports its own pending state,
 * so a slow redirect can't be double-tapped into two submissions.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
