/**
 * forceRelogueOnDeployOnce.ts
 *
 * FIX63: opção (desligada por padrão, ligada via FORCE_RELOGIN_ON_DEPLOY=true)
 * para desconectar todo mundo quando uma atualização de verdade sobe --
 * pedido explícito para blindar o sistema contra qualquer risco de alguém
 * continuar operando com o frontend antigo em cima de um backend/schema novo
 * durante e logo após o deploy.
 *
 * "Atualização de verdade" = a release mudou desde o último boot, não
 * simplesmente o container reiniciou com o mesmo código (um crash-restart
 * comum não deveria expulsar ninguém). Guarda a última release já vista numa
 * tabela de uma linha só; se mudou, revoga os refresh tokens (sessões de
 * longa duração, até 365 dias) -- os access tokens de 15 min já em uso
 * também param de validar na próxima requisição via o claim `rel` embutido
 * neles e checado em authMiddleware (ver middleware/auth.ts).
 *
 * Nunca lança: assim como as outras verificações não-essenciais chamadas em
 * db/migrate.ts, uma falha aqui vira warning, nunca trava o startup.
 */
import pool from './pool'
import { NEXUS_RELEASE } from '../release'

export async function forceRelogueOnDeployOnce(): Promise<void> {
  if (process.env.FORCE_RELOGIN_ON_DEPLOY !== 'true') return

  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nexus_deploy_state (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
        ultima_release TEXT,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const row = await client.query<{ ultima_release: string | null }>(
      'SELECT ultima_release FROM nexus_deploy_state LIMIT 1',
    )
    const ultimaRelease = row.rows[0]?.ultima_release ?? null

    if (ultimaRelease === NEXUS_RELEASE) {
      console.log(`[DEPLOY] FORCE_RELOGIN_ON_DEPLOY ativo: mesma release (${NEXUS_RELEASE}) -- sessões preservadas.`)
      return
    }

    const revogados = await client.query('DELETE FROM refresh_tokens')
    console.log(
      `[DEPLOY] FORCE_RELOGIN_ON_DEPLOY ativo: release mudou de "${ultimaRelease || '(primeiro boot)'}" para ` +
      `"${NEXUS_RELEASE}". ${revogados.rowCount ?? 0} sessão(ões) de longa duração revogada(s). ` +
      `Tokens de acesso já em uso param de validar na próxima requisição de cada um.`,
    )

    await client.query(
      `INSERT INTO nexus_deploy_state (id, ultima_release, atualizado_em) VALUES (TRUE, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET ultima_release = EXCLUDED.ultima_release, atualizado_em = NOW()`,
      [NEXUS_RELEASE],
    )
  } finally {
    client.release()
  }
}
