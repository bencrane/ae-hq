/**
 * Layout primitives: Stack, Inline, Grid, Box.
 *
 * These own all spacing/sizing in the design system. Routes describe content;
 * the layout primitives describe geometry.
 */

import { type ElementType, type ReactNode, forwardRef } from "react";
import {
  type BorderProp,
  type SpacingProp,
  type SurfaceProp,
  type TextColorProp,
  borderColor,
  cx,
  space,
  surfaceBg,
  textColor,
} from "./utils";

type DivProps = Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">;

interface CommonProps {
  children?: ReactNode;
  /** Escape hatch — last resort. Lints surface this in routes; allowed on primitives. */
  unsafe_className?: string;
  as?: ElementType;
}

// ────────────── Stack — vertical flex with gap ──────────────

export interface StackProps extends DivProps, CommonProps {
  gap?: SpacingProp;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  /** padding on the cross axis (horizontal in a column) */
  px?: SpacingProp;
  py?: SpacingProp;
  p?: SpacingProp;
}

const alignMap = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
} as const;

const justifyMap = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
} as const;

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { gap = "4", align, justify, px, py, p, as: As = "div", children, unsafe_className, ...rest },
  ref,
) {
  return (
    <As
      ref={ref}
      className={cx(
        "flex flex-col",
        space.gap[gap],
        align && alignMap[align],
        justify && justifyMap[justify],
        p && space.p[p],
        px && space.px[px],
        py && space.py[py],
        unsafe_className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
});

// ────────────── Inline — horizontal flex with gap ──────────────

export interface InlineProps extends DivProps, CommonProps {
  gap?: SpacingProp;
  align?: "start" | "center" | "end" | "baseline" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  wrap?: boolean;
  px?: SpacingProp;
  py?: SpacingProp;
  p?: SpacingProp;
}

const inlineAlignMap = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
  stretch: "items-stretch",
} as const;

export const Inline = forwardRef<HTMLDivElement, InlineProps>(function Inline(
  {
    gap = "4",
    align = "center",
    justify,
    wrap,
    px,
    py,
    p,
    as: As = "div",
    children,
    unsafe_className,
    ...rest
  },
  ref,
) {
  return (
    <As
      ref={ref}
      className={cx(
        "flex",
        wrap && "flex-wrap",
        space.gap[gap],
        inlineAlignMap[align],
        justify && justifyMap[justify],
        p && space.p[p],
        px && space.px[px],
        py && space.py[py],
        unsafe_className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
});

// ────────────── Grid ──────────────

export interface GridProps extends DivProps, CommonProps {
  /** Column counts at each breakpoint. */
  cols?: 1 | 2 | 3 | 4 | 6 | 12;
  mdCols?: 1 | 2 | 3 | 4 | 6 | 12;
  lgCols?: 1 | 2 | 3 | 4 | 6 | 12;
  gap?: SpacingProp;
}

const colMap = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  6: "grid-cols-6",
  12: "grid-cols-12",
} as const;

const mdColMap = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  6: "md:grid-cols-6",
  12: "md:grid-cols-12",
} as const;

const lgColMap = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  6: "lg:grid-cols-6",
  12: "lg:grid-cols-12",
} as const;

export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid(
  { cols = 1, mdCols, lgCols, gap = "4", as: As = "div", children, unsafe_className, ...rest },
  ref,
) {
  return (
    <As
      ref={ref}
      className={cx(
        "grid",
        colMap[cols],
        mdCols && mdColMap[mdCols],
        lgCols && lgColMap[lgCols],
        space.gap[gap],
        unsafe_className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
});

// ────────────── Box — generic styled container ──────────────

export interface BoxProps extends DivProps, CommonProps {
  bg?: SurfaceProp;
  border?: BorderProp;
  color?: TextColorProp;
  p?: SpacingProp;
  px?: SpacingProp;
  py?: SpacingProp;
  rounded?: "none" | "xl";
}

const roundedMap = {
  none: "rounded-none",
  xl: "rounded-xl",
} as const;

export const Box = forwardRef<HTMLDivElement, BoxProps>(function Box(
  { bg, border, color, p, px, py, rounded, as: As = "div", children, unsafe_className, ...rest },
  ref,
) {
  return (
    <As
      ref={ref}
      className={cx(
        bg && surfaceBg[bg],
        border && cx("border", borderColor[border]),
        color && textColor[color],
        p && space.p[p],
        px && space.px[px],
        py && space.py[py],
        rounded && roundedMap[rounded],
        unsafe_className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
});

// ────────────── Divider ──────────────

export interface DividerProps {
  /** Orientation. */
  axis?: "horizontal" | "vertical";
  color?: BorderProp;
  unsafe_className?: string;
}

export function Divider({ axis = "horizontal", color = "subtle", unsafe_className }: DividerProps) {
  // <hr> is the semantic separator. We pin orientation via aria-orientation.
  // Vertical "separators" within a horizontal flow use role="separator" on a
  // generic span — the browser-default <hr> is horizontal-only.
  if (axis === "horizontal") {
    return (
      <hr
        className={cx(
          "h-px w-full border-0",
          borderColor[color].replace("border-", "bg-"),
          unsafe_className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block h-full w-px",
        borderColor[color].replace("border-", "bg-"),
        unsafe_className,
      )}
    />
  );
}
