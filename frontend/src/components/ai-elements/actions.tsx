"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type ActionsProps = ComponentProps<"div">;

export const Actions = ({ className, children, ...props }: ActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type ActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const Action = ({
  tooltip,
  children,
  label,
  className,
  variant = "ghost",
  size = "sm",
  ...props
}: ActionProps) => {
  const button = (
    <Button
      className={cn(
        // Base
        "relative size-9 p-1.5 rounded-md text-muted-foreground transition-colors transition-transform",
        // Hover = accent
        "hover:bg-accent hover:text-accent-foreground",
        // Active click feedback
        "active:bg-accent active:text-accent-foreground active:scale-[.97]",
        // Keyboard focus
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        // Toggled state via aria-pressed
        "aria-pressed:bg-accent aria-pressed:text-accent-foreground",
        className
      )}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};
