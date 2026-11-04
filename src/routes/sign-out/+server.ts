import { redirect } from "@sveltejs/kit";
import { getAuth, isAuthConfigured } from "#lib/server/auth";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  if (!isAuthConfigured()) redirect(303, "/");
  const auth = getAuth();
  await auth.api.signOut({ headers: request.headers });
  throw redirect(303, "/");
};
