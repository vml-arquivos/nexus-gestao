# Deploy FIX64 — recorrência por item do checklist

Release esperada: `fix64-recorrencia-checklist-por-item-20260810`.

## Interface esperada

Ao criar ou editar uma lista, cada item exibe quatro opções próprias:

- Única
- Diária — lembrar todos os dias
- Semanal
- Mensal

A opção pertence ao item, não à lista inteira. O lembrete reutiliza o mesmo ID
e o mesmo histórico até conclusão e aprovação; não cria tarefa duplicada.

O modal correto também exibe o aviso `Recorrência por item ativa`, o marcador
`R2` e o cabeçalho azul no padrão visual Destrava.

## Publicação segura

1. Substitua o repositório completo por esta pasta.
2. Faça build sem reaproveitar a imagem anterior.
3. Aguarde o healthcheck ficar saudável.
4. Confirme `GET /version` e verifique:

   ```json
   {"release":"fix64-recorrencia-checklist-por-item-20260810"}
   ```

5. Abra `Tarefas > Nova lista` e confirme o aviso `R2` antes de testar.

A recuperação de chunks antigos limpa somente o cache do shell principal. O
service worker e os dados do painel offline são preservados.
