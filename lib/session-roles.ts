/** Papéis gravados no cookie `tm.session` e na tabela `users`. */
export type SessionRole = "admin" | "staff" | "developer";

export function isSessionRole(v: string): v is SessionRole {
  return v === "admin" || v === "staff" || v === "developer";
}

/** Acesso ao painel /dashboard e APIs operacionais (vendas, cedentes, etc.). */
export function isOperationalRole(role: string): boolean {
  return role === "admin" || role === "staff" || role === "developer";
}

/** Entra em comissões de milhas / lista de funcionários como colaborador pagável. */
export function isPayrollStaffRole(role: string): boolean {
  return role === "admin" || role === "staff";
}

/** Ações exclusivas de administrador do time (cadastro de funcionários, pagar comissão). */
export function isAdminRole(role: string): boolean {
  return role === "admin";
}
