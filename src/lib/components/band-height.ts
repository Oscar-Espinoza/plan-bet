/** Observe a band, including wrapping text, zoom and safe areas. */
export function bandHeight(
  node: HTMLElement,
  variable: "--nav-h" | "--tour-h",
) {
  const shell = node.closest<HTMLElement>(".app-shell");
  const measure = () => {
    shell?.style.setProperty(
      variable,
      `${node.getBoundingClientRect().height}px`,
    );
  };
  measure();
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  observer?.observe(node);
  return {
    destroy() {
      observer?.disconnect();
      shell?.style.setProperty(variable, "0px");
    },
  };
}
