export function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function ok(data: any = {}, status = 200) {
  return json({ ok: true, ...data }, status);
}

export function fail(error: string, status = 400, extra?: any) {
  return json({ ok: false, error, ...(extra || {}) }, status);
}

export function badRequest(error = "Requisição inválida.", extra?: any) {
  return fail(error, 400, extra);
}

export function unauthorized(error = "Não autorizado.", extra?: any) {
  return fail(error, 401, extra);
}

export function forbidden(error = "Acesso negado.", extra?: any) {
  return fail(error, 403, extra);
}

export function notFound(error = "Não encontrado.", extra?: any) {
  return fail(error, 404, extra);
}

export function conflict(error = "Conflito.", extra?: any) {
  return fail(error, 409, extra);
}

export function serverError(error = "Erro interno.", extra?: any) {
  return fail(error, 500, extra);
}

/**
 * Utilitário: converte query string para int com fallback
 */
export function toInt(v: string | null | undefined, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
