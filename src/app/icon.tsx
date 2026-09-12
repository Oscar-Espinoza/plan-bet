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
        background: "#d6d7d9",
      }}
    >
      <div
        style={{
          width: 52,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0c",
          color: "#d8ff3c",
          transform: "skewX(-10deg)",
          fontFamily: "Archivo",
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        <span style={{ transform: "skewX(10deg)" }}>MP</span>
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
