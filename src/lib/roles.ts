export type Role = 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro' | string | undefined | null

export function isSuperAdmin(role: Role): boolean {
  return role === 'dev'
}

export function isAdminOrDev(role: Role): boolean {
  return role === 'admin' || isSuperAdmin(role)
}

export function isGestorLike(role: Role): boolean {
  return role === 'admin' || role === 'dev' || role === 'gestor' || role === 'sub_gestor'
}

export function isGestorOwner(role: Role): boolean {
  return role === 'admin' || role === 'dev' || role === 'gestor'
}

export function isMembro(role: Role): boolean {
  return role === 'membro'
}

export function roleLabel(role: Role): string {
  if (role === 'admin') return 'Admin'
  if (role === 'dev') return 'Super Admin'
  if (role === 'gestor') return 'Gestor'
  if (role === 'sub_gestor') return 'Sub-Gestor'
  if (role === 'membro') return 'Membro'
  return 'Usuário'
}
