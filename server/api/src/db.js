import { PrismaClient } from "@prisma/client";

// One client per process. Prisma pools connections internally; constructing a
// second client in a route handler exhausts Postgres connections under load.
export const prisma = new PrismaClient();
