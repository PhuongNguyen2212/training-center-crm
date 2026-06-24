import { z } from "zod";
import { isValidCccd } from "../../lib/cccd";

// Validation mirrors the CLAUDE.md business rule:
// when enrollment_status === "confirmed", cccd_number is REQUIRED and must be a
// valid Vietnamese national ID (12 digits + a real province-code prefix).
export const studentSchema = z
  .object({
    name: z.string().trim().min(2, "Vui lòng nhập họ và tên"),
    age: z
      .union([z.coerce.number().int().min(1).max(120), z.literal("")])
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^(0\d{9,10})?$/, "Số điện thoại không hợp lệ")
      .optional()
      .or(z.literal("")),
    jobTitle: z.string().trim().optional().or(z.literal("")),
    goal: z.string().trim().optional().or(z.literal("")),
    enrollmentStatus: z.enum(["prospect", "confirmed", "dropped"]),
    cccdNumber: z
      .string()
      .trim()
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.enrollmentStatus === "confirmed") {
      if (!data.cccdNumber || !isValidCccd(data.cccdNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cccdNumber"],
          message:
            "Học viên đã xác nhận phải có số CCCD gồm 12 chữ số và mã tỉnh hợp lệ.",
        });
      }
    }
  });

export type StudentFormValues = z.infer<typeof studentSchema>;
