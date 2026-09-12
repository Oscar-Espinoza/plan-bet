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
      "node_modules/@fontsource/archivo/files/archivo-latin-700-normal.woff",
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
        background: "#08090b",
      }}
    >
      <div
        style={{
          width: 52,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f6f8",
          color: "#08090b",
          fontFamily: "Archivo",
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        MP
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Archivo",
          data: displayFont,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
