import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { userRegions } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const regionsRouter = Router();

regionsRouter.use(requireAuth);

const addRegionSchema = z.object({
  geo: z.string().trim().max(8),
});

/** GET / — lists the region codes the authenticated user tracks. Worldwide ("") is implicit and never stored here. */
regionsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await db
      .select({ geo: userRegions.geo })
      .from(userRegions)
      .where(eq(userRegions.userId, req.userId!))
      .orderBy(userRegions.createdAt);
    res.json(rows.map((r) => r.geo));
  } catch (err) {
    next(err);
  }
});

/** POST / — adds a region for the authenticated user to track. Idempotent: adding an already-tracked region is a no-op, not an error. */
regionsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = addRegionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    await db
      .insert(userRegions)
      .values({ userId: req.userId!, geo: parsed.data.geo })
      .onConflictDoNothing();

    res.status(201).json({ geo: parsed.data.geo });
  } catch (err) {
    next(err);
  }
});

/** DELETE /:geo — removes a region the authenticated user was tracking. Idempotent: removing one that isn't tracked is a no-op, not an error. */
regionsRouter.delete("/:geo", async (req, res, next) => {
  try {
    await db
      .delete(userRegions)
      .where(and(eq(userRegions.userId, req.userId!), eq(userRegions.geo, req.params.geo)));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
