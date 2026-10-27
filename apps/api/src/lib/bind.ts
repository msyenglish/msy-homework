// ============================================================
//  D1 bound-parameter guard.
//  D1 rejects any statement with more than 100 bound parameters
//  ("too many SQL variables", SQLITE_ERROR 7500) — an `inArray(...)` over a long id list
//  therefore has to be split. Chunk size leaves room for the other params of the statement.
// ============================================================

export const BIND_CHUNK = 90;

/** Runs `run` over id slices that fit D1's parameter budget and concatenates the rows. */
export async function inChunks<T>(
  ids: string[],
  run: (slice: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += BIND_CHUNK) {
    out.push(...(await run(ids.slice(i, i + BIND_CHUNK))));
  }
  return out;
}
