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
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const content =
    asChild &&
    React.isValidElement<{ children?: React.ReactNode }>(children) ? (
      React.cloneElement(
        children,
        {},
        <span className="plate-content">{children.props.children}</span>,
      )
    ) : (
      <span className="plate-content">{children}</span>
    );
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
    >
      {content}
    </Comp>
  );
}
