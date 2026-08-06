import { z } from "zod";

export const locationWriteSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  summary: z.string().min(2).max(2000).optional(),
  description: z.string().max(10000).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  website: z.string().url().max(500).nullable().optional().or(z.literal("")),
  email: z.string().email().max(200).nullable().optional().or(z.literal("")),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  status: z
    .enum(["DRAFT", "PENDING_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED"])
    .optional(),
  verificationNotes: z.string().max(4000).nullable().optional(),
  verificationSource: z.string().max(500).nullable().optional(),
  coordQuality: z.enum(["verified", "estimated", "town-centre", "unknown"]).optional(),
  coordSource: z.string().max(500).nullable().optional(),
  verificationExpiresAt: z.string().datetime().nullable().optional(),
  categoryId: z.string().max(40).optional(),
  districtId: z.string().max(40).nullable().optional(),
  municipalityId: z.string().max(40).nullable().optional(),
  provinceId: z.string().max(40).optional(),
  organisationId: z.string().max(40).nullable().optional(),
  opportunities: z.array(z.string().max(300)).max(50).optional(),
  assets: z.array(z.string().max(300)).max(50).optional(),
  tags: z.array(z.string().max(80)).max(40).optional(),
  evidence: z
    .array(
      z.object({
        title: z.string().max(200).optional(),
        url: z.string().max(500).nullable().optional(),
        documentRef: z.string().max(200).nullable().optional(),
        capturedAt: z.string().max(40).optional(),
      })
    )
    .max(20)
    .optional(),
  sourceTitle: z.string().max(200).optional(),
  sourceUrl: z.string().max(500).nullable().optional(),
  documentRef: z.string().max(200).nullable().optional(),
  sourceNotes: z.string().max(2000).nullable().optional(),
  categorySlug: z.string().max(80).optional(),
  provinceSlug: z.string().max(80).optional(),
  slug: z.string().max(80).optional(),
});

export const locationCreateSchema = locationWriteSchema.extend({
  name: z.string().min(2).max(200),
  summary: z.string().min(2).max(2000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const submissionSchema = z.object({
  type: z.string().max(40).optional().default("location"),
  submitterName: z.string().min(2).max(120),
  submitterEmail: z.string().email().max(200),
  notes: z.string().max(2000).nullable().optional(),
  provinceId: z.string().max(40).nullable().optional(),
  organisationId: z.string().max(40).nullable().optional(),
  payload: z.object({
    name: z.string().min(2).max(200),
    summary: z.string().min(2).max(2000),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    categorySlug: z.string().max(80).optional(),
    provinceSlug: z.string().max(80).optional(),
    opportunities: z.array(z.string().max(300)).max(50).optional(),
    assets: z.array(z.string().max(300)).max(50).optional(),
  }),
  captchaToken: z.string().max(4000).optional(),
  website: z.string().max(0).optional(), // honeypot
  consent: z.boolean().optional(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email().max(200),
});

export const passwordResetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(128),
});

export const invitationAcceptSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().min(2).max(120),
  password: z.string().min(12).max(128),
});

export const userCreateSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(2).max(120),
  role: z.enum(["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"]),
  password: z.string().min(12).max(128),
  provinceId: z.string().max(40).nullable().optional(),
  organisationId: z.string().max(40).nullable().optional(),
});
