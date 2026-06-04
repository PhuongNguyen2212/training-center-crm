import { z } from "zod";

// Validation mirrors the CLAUDE.md business rule:
// when enrollment_status === "confirmed", cccd_number is REQUIRED and must
// match the 12-digit Vietnamese national ID format.
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
      if (!data.cccdNumber || !/^[0-9]{12}$/.test(data.cccdNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cccdNumber"],
          message:
            "Học viên đã xác nhận phải có số CCCD gồm đúng 12 chữ số.",
        });
      }
    }
  });

export type StudentFormValues = z.infer<typeof studentSchema>;
