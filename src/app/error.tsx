"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state" style={{ minHeight: "65vh" }}>
      <div>
        <span className="empty-icon">
          <AlertTriangle aria-hidden="true" />
        </span>
        <p className="eyebrow">Something went wrong</p>
        <h1 className="display-title">This page hit an error</h1>
        <p className="empty-copy">Try again, or head back to the dashboard.</p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
