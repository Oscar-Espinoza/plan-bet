import { z } from "zod";

export const sportPreferenceSchema = z
  .enum(["all", "soccer", "baseball"])
  .catch("all");
