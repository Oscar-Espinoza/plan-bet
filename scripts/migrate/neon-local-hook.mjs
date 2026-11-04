const shim = new URL("./neon-local-shim.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@neondatabase/serverless") {
    return { url: shim, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
