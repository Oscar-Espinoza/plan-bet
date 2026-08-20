import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm" | "icon";
  ref?: React.Ref<HTMLButtonElement>;
};

export function Button({
  className,
  asChild,
  variant = "primary",
  size = "default",
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type}
      className={cn(
        "button",
        variant === "secondary" && "button-secondary",
        variant === "ghost" && "button-ghost",
        variant === "danger" && "button-danger",
        size === "sm" && "button-sm",
        size === "icon" && "button-icon",
        className,
      )}
      {...props}
    />
  );
}
