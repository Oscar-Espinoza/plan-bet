const stub = new URL("./cloudflare-workers-stub.mjs", import.meta.url).href;

const hasExtension = /\.(ts|js|mjs|cjs|json|svelte)$/;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: stub, shortCircuit: true };
  }
  const relative =
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#lib/");
  if (relative && !hasExtension.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // A .js twin, or a package-style path the default resolver understands.
    }
  }
  return nextResolve(specifier, context);
}
