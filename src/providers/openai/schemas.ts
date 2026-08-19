import { z } from "zod";

/**
 * The subset of the OpenAI Responses envelope this project reads. Unknown item
 * and content types are tolerated so a provider-side addition cannot fail a
 * generation; the text extraction below simply ignores them.
 */
const responseContentSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  refusal: z.string().optional(),
});

const responseOutputSchema = z.object({
  type: z.string(),
  content: z.array(responseContentSchema).optional(),
});

export const openAiResponseSchema = z.object({
  model: z.string(),
  status: z.string().optional(),
  incomplete_details: z.object({ reason: z.string() }).nullish(),
  output: z.array(responseOutputSchema),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});
export type OpenAiResponse = z.infer<typeof openAiResponseSchema>;

/** The assistant's JSON text, or a refusal string when the model declined. */
export function readOutput(response: OpenAiResponse) {
  const parts = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);
  const refusal = parts.find((part) => part.type === "refusal");
  if (refusal) return { refused: true as const };
  const text = parts.find((part) => part.type === "output_text")?.text;
  return text ? { refused: false as const, text } : undefined;
}
