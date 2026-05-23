// Setup.tsx — componente legado, mantido para compatibilidade
// O fluxo de onboarding agora é feito via Login.tsx com JWT
export default function Setup({ onDone }: { onDone: () => void }) {
  onDone()
  return null
}
