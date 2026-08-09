import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const keywordsRouter = Router();

keywordsRouter.use(requireAuth);

const createKeywordSchema = z.object({
  term: z.string().trim().min(1, "El término no puede estar vacío"),
  category: z.string().trim().min(1).optional(),
});

/** POST / — creates a keyword owned by the authenticated user. */
keywordsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createKeywordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { term, category } = parsed.data;

    const [keyword] = await db
      .insert(keywords)
      .values({ userId: req.userId!, term, ...(category ? { category } : {}) })
      .returning();

    res.status(201).json(keyword);
  } catch (err) {
    // Drizzle wraps driver errors in a DrizzleQueryError; the original
    // Postgres error (with its `code`) lives in `.cause`.
    const pgCode = (err as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: "Ya estás trackeando esa keyword" });
      return;
    }
    next(err);
  }
});

/** GET / — lists the authenticated user's keywords. */
keywordsRouter.get("/", async (req, res, next) => {
  try {
    const result = await db
      .select()
      .from(keywords)
      .where(eq(keywords.userId, req.userId!))
      .orderBy(keywords.category, keywords.term);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** DELETE /:id — deletes a keyword owned by the authenticated user. */
keywordsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const deleted = await db
      .delete(keywords)
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!)))
      .returning({ id: keywords.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
