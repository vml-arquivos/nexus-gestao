from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'src/pages/Tarefas.tsx'


def replace_once(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(before, after, 1)


text = PATH.read_text(encoding='utf-8')

# ── Regra de pontuação: lista completa OU individual por item — nunca as
# duas juntas. A escolha continua manual (o gestor decide na criação da
# lista) e pode ser alterada depois, na edição — por exemplo ao reabrir uma
# lista já concluída para incluir novas tarefas com pontuação individual.
#
# Histórico: esta etapa do build já chegou a substituir o seletor manual
# por uma regra 100% automática (baseada em quantos executores a lista
# tinha). Essa versão foi revertida a pedido — a escolha manual é mais
# clara para o gestor e evita confusão sobre quem está pontuando o quê.

text = replace_once(
    text,
    '''                <option value="tarefa">Somente pontuação da lista</option>
                <option value="subtarefas">Somente pontuação das tarefas da lista</option>
                <option value="ambos">Pontuação da lista e das tarefas</option>
              </select>
            </div>''',
    '''                <option value="tarefa">Pontuação pela lista completa</option>
                <option value="subtarefas">Pontuação individual por tarefa do checklist</option>
              </select>
            </div>''',
    'remove opção "ambos" (criação de lista)',
)

text = replace_once(
    text,
    '''            <div className="team-ranking-note">
              O ranking respeita a escolha acima: pode pontuar só a lista, só as tarefas da lista ou os dois, sempre somente após aprovação do gestor.
            </div>''',
    '''            <div className="team-ranking-note">
              O ranking respeita a escolha acima: pontua a lista completa ou cada tarefa individualmente, nunca os dois ao mesmo tempo — sempre somente após aprovação do gestor. Dá para mudar essa escolha depois, na edição da lista.
            </div>''',
    'nota do ranking (criação de lista)',
)

text = replace_once(
    text,
    '''                  <option value="tarefa">Somente pontuação da lista</option>
                  <option value="subtarefas">Somente pontuação das tarefas da lista</option>
                  <option value="ambos">Pontuação da lista e das tarefas</option>
                </select>
              </div>''',
    '''                  <option value="tarefa">Pontuação pela lista completa</option>
                  <option value="subtarefas">Pontuação individual por tarefa do checklist</option>
                </select>
              </div>''',
    'remove opção "ambos" (edição de lista)',
)

PATH.write_text(text, encoding='utf-8')
print('Seletor de pontuação simplificado para 2 opções manuais (lista completa / individual por item), sem "ambos".')
