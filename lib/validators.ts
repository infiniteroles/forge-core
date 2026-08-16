import { z } from "zod";
import { PROJECT_STATUSES } from "./project-status";

const slugRegex = /^[a-z0-9-]+$/;

// "create" semantics: empty string -> omitted (undefined)
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value && value.length > 0 ? value : undefined));

// "update" semantics: empty string -> null (explicit clear), absent -> undefined (no change)
const clearableUrl = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value && value.length > 0 ? value : null));

const clearableText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .or(z.literal(""))
  .transform((value) => (value && value.length > 0 ? value : null));

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(80)
    .regex(slugRegex, "Lowercase letters, numbers and dashes only"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  devUrl: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
  productionUrl: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
  repoUrl: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    slug: z
      .string()
      .trim()
      .min(1, "Slug is required")
      .max(80)
      .regex(slugRegex, "Lowercase letters, numbers and dashes only"),
    description: clearableText,
    status: z.enum(PROJECT_STATUSES),
    devUrl: clearableUrl,
    productionUrl: clearableUrl,
    repoUrl: clearableUrl,
    targetDevDomain: clearableText,
    preferredStack: clearableText,
    repositoryProvider: clearableText,
    repositoryFullName: clearableText,
    coolifyApplicationId: clearableText,
    coolifyProjectId: clearableText,
    notes: clearableText,
  })
  .partial();

export const createInstructionSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  content: z
    .string()
    .trim()
    .min(10, "Instruction must be at least 10 characters"),
  source: z.enum(["manual", "telegram", "system", "github"]).default("manual"),
});
