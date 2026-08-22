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
        "node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-700-normal.woff",
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
        background: "#0c1210",
        color: "#efede4",
        fontFamily: "IBM Plex Sans",
        padding: "70px",
        border: "1px solid #263029",
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
            borderRadius: 12,
            background: "#e8a33d",
            color: "#0c1210",
            fontFamily: "Big Shoulders Display",
            fontWeight: 700,
          }}
        >
          MP
        </div>
        Matchday Plan
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            color: "#e8a33d",
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
            fontFamily: "Big Shoulders Display",
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 0.96,
            textTransform: "uppercase",
          }}
        >
          Back a side. Watch how your read ages.
        </div>
      </div>
      <div style={{ display: "flex", color: "#9aa79c", fontSize: 22 }}>
        Soccer · Baseball · Fictional credits, not a sportsbook
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Big Shoulders Display",
          data: display,
          weight: 700,
          style: "normal",
        },
        { name: "IBM Plex Sans", data: body, weight: 400, style: "normal" },
      ],
    },
  );
}
