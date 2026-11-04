import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Matchday Plan — practice your calls on real fixtures";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori (next/og's renderer) doesn't parse woff2 — only the variable
// packages ship that. The static @fontsource packages ship a plain .woff
// per weight, so they're installed just for this one static image.
async function loadFonts() {
  const [display, body] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "node_modules/@fontsource/archivo/files/archivo-latin-700-normal.woff",
      ),
    ),
    readFile(
      path.join(
        process.cwd(),
        "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff",
      ),
    ),
  ]);
  return { display, body };
}

export default async function OpenGraphImage() {
  const { display, body } = await loadFonts();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#08090b",
        color: "#f4f6f8",
        fontFamily: "IBM Plex Sans",
        padding: "70px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "22px",
          fontSize: 28,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 64,
            height: 64,
            alignItems: "center",
            justifyContent: "center",
            background: "#f4f6f8",
            color: "#08090b",
            fontFamily: "Archivo",
            fontWeight: 700,
          }}
        >
          MP
        </div>
        Matchday Plan
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#101318",
          color: "#f4f6f8",
          borderLeft: "6px solid #f4f6f8",
          padding: "28px 32px 40px",
        }}
      >
        <div
          style={{
            color: "#98a1ae",
            fontSize: 22,
            letterSpacing: 5,
            textTransform: "uppercase",
          }}
        >
          Practice your calls
        </div>
        <div
          style={{
            maxWidth: 900,
            fontFamily: "Archivo",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 0.96,
            textTransform: "uppercase",
          }}
        >
          Back a side. Watch how your read ages.
        </div>
      </div>
      <div style={{ display: "flex", color: "#7f8896", fontSize: 22 }}>
        Soccer · Baseball · Fictional credits, not a sportsbook
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Archivo",
          data: display,
          weight: 700,
          style: "normal",
        },
        { name: "IBM Plex Sans", data: body, weight: 400, style: "normal" },
      ],
    },
  );
}
