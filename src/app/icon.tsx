import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Satori (next/og's renderer) doesn't parse woff2 — only the variable
// package ships that. The static @fontsource package ships a plain .woff
// per weight, so it's installed just for this one static instance.
async function loadDisplayFont() {
  return readFile(
    path.join(
      process.cwd(),
      "node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-700-normal.woff",
    ),
  );
}

export default async function Icon() {
  const displayFont = await loadDisplayFont();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e8a33d",
        color: "#0c1210",
        borderRadius: 12,
        fontFamily: "Big Shoulders Display",
        fontSize: 30,
        fontWeight: 700,
      }}
    >
      MP
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Big Shoulders Display",
          data: displayFont,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
