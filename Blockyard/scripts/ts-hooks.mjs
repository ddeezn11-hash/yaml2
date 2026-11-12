/* Resolve hook: try the specifier as-is, then with .ts / /index.ts appended. */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    try {
      return await next(specifier, context);
    } catch (err) {
      if (err?.code === "ERR_MODULE_NOT_FOUND") {
        const candidates = [
          `${specifier}.ts`,
          `${specifier}.tsx`,
          `${specifier}.js`,
          `${specifier}/index.ts`,
        ];
        for (const candidate of candidates) {
          try {
            return await next(candidate, context);
          } catch {
            /* try next */
          }
        }
      }
      throw err;
    }
  }
  return next(specifier, context);
}
