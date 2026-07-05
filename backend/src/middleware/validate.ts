import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Validate req.body against a zod schema. On success, replaces req.body with
 * the parsed (typed) value. On failure, returns 400 with the issues.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "validation_error",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate req.query against a zod schema.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: "validation_error",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    // Store parsed query separately to avoid readonly assignment issues.
    (req as unknown as { validatedQuery: T }).validatedQuery = result.data;
    next();
  };
}
