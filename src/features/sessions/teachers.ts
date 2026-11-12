import { seedUsers } from "@/data/seed";

export const teachers = seedUsers.filter((u) => u.role === "teacher");
