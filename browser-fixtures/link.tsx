import type { ComponentProps } from "react";
import { navigate } from "./navigation";
export default function Link({
  href = "/",
  onClick,
  ...props
}: ComponentProps<"a">) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          event.button === 0 &&
          href.startsWith("/")
        ) {
          event.preventDefault();
          navigate(href);
        }
      }}
    />
  );
}
