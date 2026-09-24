import localFont from "next/font/local";

// The same fontsource files globals.css used to @import, loaded through
// next/font instead so the two text faces are preloaded with the document
// (not discovered after the stylesheet parses) and get a metric-matched
// fallback that keeps the swap from shifting the layout. Latin subset only:
// it covers English and Spanish; the odd latin-ext glyph in an opponent's
// name falls back to the metric-matched system face.
export const archivo = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
  weight: "100 900",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-archivo",
  fallback: ["Arial Narrow", "sans-serif"],
});

export const plexSans = localFont({
  src: "../../node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
  weight: "100 700",
  variable: "--font-plex",
  fallback: ["system-ui", "sans-serif"],
});

// Preloaded too: every figure renders on the server now, so a late DM Mono
// swap reflows kickoff times, form strips and prices (measured CLS 0.07).
export const dmMono = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2",
      weight: "500",
    },
  ],
  variable: "--font-dm-mono",
  fallback: ["ui-monospace", "SF Mono", "monospace"],
});
