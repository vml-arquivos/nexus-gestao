# Segurança dos segredos no Coolify

O log de deploy de 30/07/2026 exibiu o valor de `JWT_REFRESH_SECRET`. Esse
segredo deve ser considerado comprometido.

## Ação obrigatória

1. No Coolify, abra as variáveis do Nexus.
2. Desative a opção de build/build-time para:
   - `JWT_SECRET`;
   - `JWT_REFRESH_SECRET`;
   - `DATABASE_URL`;
   - senhas, tokens e chaves privadas.
3. Mantenha como build-time somente variáveis públicas necessárias ao frontend,
   normalmente as iniciadas por `VITE_`.
4. Gere um novo `JWT_REFRESH_SECRET` fora do chat:

   ```bash
   openssl rand -base64 64
   ```

5. Cadastre o novo valor como variável somente de runtime e faça o redeploy.

A rotação não apaga usuários, tarefas, arquivos, pontuações ou dados do banco.
Ela invalida sessões de atualização existentes; os usuários precisarão entrar
novamente após o access token atual expirar.

Não publique nem envie o novo segredo em prints, logs ou mensagens.
