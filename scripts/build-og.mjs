#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadFont(relative) {
  return readFile(path.join(root, "node_modules", relative));
}

async function renderPng(element, width, height, fonts) {
  const svg = await satori(element, { width, height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return resvg.render().asPng();
}

async function main() {
  const display = await loadFont(
    "@fontsource/archivo/files/archivo-latin-700-normal.woff",
  );
  const body = await loadFont(
    "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff",
  );
  const displayFont = {
    name: "Archivo",
    data: display,
    weight: 700,
    style: "normal",
  };
  const bodyFont = {
    name: "IBM Plex Sans",
    data: body,
    weight: 400,
    style: "normal",
  };

  const icon = await renderPng(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08090b",
        },
        children: {
          type: "div",
          props: {
            style: {
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
            },
            children: "MP",
          },
        },
      },
    },
    64,
    64,
    [displayFont],
  );

  const og = await renderPng(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#08090b",
          color: "#f4f6f8",
          fontFamily: "IBM Plex Sans",
          padding: "70px",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "22px",
                fontSize: 28,
                letterSpacing: 2,
                textTransform: "uppercase",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      width: 64,
                      height: 64,
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#f4f6f8",
                      color: "#08090b",
                      fontFamily: "Archivo",
                      fontWeight: 700,
                    },
                    children: "MP",
                  },
                },
                "Matchday Plan",
              ],
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                background: "#101318",
                color: "#f4f6f8",
                borderLeft: "6px solid #f4f6f8",
                padding: "28px 32px 40px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      color: "#98a1ae",
                      fontSize: 22,
                      letterSpacing: 5,
                      textTransform: "uppercase",
                    },
                    children: "Practice your calls",
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      maxWidth: 900,
                      fontFamily: "Archivo",
                      fontSize: 72,
                      fontWeight: 700,
                      lineHeight: 0.96,
                      textTransform: "uppercase",
                    },
                    children: "Back a side. Watch how your read ages.",
                  },
                },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: { display: "flex", color: "#7f8896", fontSize: 22 },
              children:
                "Soccer · Baseball · Fictional credits, not a sportsbook",
            },
          },
        ],
      },
    },
    1200,
    630,
    [displayFont, bodyFont],
  );

  await writeFile(path.join(root, "static", "icon.png"), icon);
  await writeFile(path.join(root, "static", "og.png"), og);
  console.log("BUILD OG OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
