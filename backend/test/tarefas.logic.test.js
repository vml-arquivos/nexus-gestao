const test = require('node:test')
const assert = require('node:assert/strict')

const {
  __taskChecklistTestUtils: utils,
} = require('../dist/routes/tarefas.js')

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

function parse(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

test('aceita explicitamente o escopo de pontuação ambos e preserva legado', () => {
  assert.equal(utils.normalizePontuacaoEscopo('ambos'), 'ambos')
  assert.equal(utils.normalizePontuacaoEscopo('task_and_checklist'), 'ambos')
  assert.equal(utils.normalizePontuacaoEscopo(undefined), 'tarefa')
})

test('mantém a dificuldade nível 4 e a escala oficial de 5 pontos', () => {
  assert.equal(utils.normalizeChecklistDifficulty('nivel_4'), 'nivel_4')
  assert.equal(
    utils.calculateChecklistItemPoints({ dificuldade: 'nivel_4', pontuacao: 5 }, {}),
    5,
  )
})

test('gera id legado determinístico em leituras repetidas', () => {
  const legacy = [{ texto: 'Conferir documento', feito: false }]
  const first = utils.parseChecklistItems(legacy)[0]
  const second = utils.parseChecklistItems(legacy)[0]
  assert.equal(first.id, second.id)
  assert.match(first.id, /^legacy-check-/)
})

test('merge parcial do membro preserva itens invisíveis e registra autoria', () => {
  const existing = [
    { id: 'item-a', texto: 'Parte A', responsavel_id: USER_A, feito: false, pontuacao: 3 },
    { id: 'item-b', texto: 'Parte B', responsavel_id: USER_B, feito: false, pontuacao: 5 },
  ]
  const submittedVisibleSlice = [
    { id: 'item-a', texto: 'Parte A', responsavel_id: USER_A, feito: true, pontuacao: 3 },
  ]
  const merged = parse(
    utils.mergeMemberChecklistUpdate(
      existing,
      submittedVisibleSlice,
      { responsavel_id: null, criado_por: USER_B },
      USER_A,
    ),
  )

  assert.equal(merged.length, 2)
  assert.equal(merged[0].feito, true)
  assert.equal(merged[0].concluido_por, USER_A)
  assert.equal(merged[0].feito_por, USER_A)
  assert.equal(merged[1].id, 'item-b')
  assert.equal(merged[1].feito, false)
})

test('membro não consegue alterar item de outro executor', () => {
  const existing = [
    { id: 'item-b', texto: 'Parte B', responsavel_id: USER_B, feito: false },
  ]
  assert.throws(
    () => utils.mergeMemberChecklistUpdate(
      existing,
      [{ id: 'item-b', texto: 'Parte B', responsavel_id: USER_B, feito: true }],
      { responsavel_id: null, criado_por: USER_A },
      USER_A,
    ),
    /Apenas o executor/,
  )
})

test('item concluído continua visível para o executor histórico', () => {
  const task = {
    escopo: 'equipe',
    criado_por: USER_B,
    responsavel_id: USER_B,
    checklist: [
      {
        id: 'done-a',
        texto: 'Executado por A',
        responsavel_id: USER_B,
        concluido_por: USER_A,
        feito_por: USER_A,
        feito: true,
      },
      {
        id: 'private-b',
        texto: 'Somente B',
        responsavel_id: USER_B,
        feito: false,
      },
    ],
  }
  const visible = utils.filterChecklistForUser(task, {
    userId: USER_A,
    orgId: '33333333-3333-4333-8333-333333333333',
    role: 'membro',
  })
  assert.deepEqual(visible.map((item) => item.id), ['done-a'])
})

test('concluir um item de lista de executor único não esconde os demais itens', () => {
  const task = {
    escopo: 'equipe',
    criado_por: USER_A,
    responsavel_id: USER_A,
    checklist: [
      { id: 'item-1', texto: 'testar a consulta do Rating', feito: false },
      { id: 'item-2', texto: 'incluir o raio no sistema', feito: false },
    ],
  }
  const antes = utils.filterChecklistForUser(task, {
    userId: USER_A,
    orgId: '33333333-3333-4333-8333-333333333333',
    role: 'membro',
  })
  assert.deepEqual(antes.map((item) => item.id), ['item-1', 'item-2'])

  const taskComItemConcluido = {
    ...task,
    checklist: [
      { ...task.checklist[0], feito: true, concluido_por: USER_A, feito_por: USER_A },
      task.checklist[1],
    ],
  }
  const depois = utils.filterChecklistForUser(taskComItemConcluido, {
    userId: USER_A,
    orgId: '33333333-3333-4333-8333-333333333333',
    role: 'membro',
  })
  assert.deepEqual(depois.map((item) => item.id), ['item-1', 'item-2'])
  assert.equal(depois.find((item) => item.id === 'item-1').feito, true)
  assert.equal(depois.find((item) => item.id === 'item-2').feito, false)
})

test('lista livre com item já concluído por alguém não pode ser assumida por outro (mesmo sem aceita_por gravado)', () => {
  const task = {
    escopo: 'equipe',
    modo_distribuicao: 'livre_equipe',
    checklist: [
      { id: 'item-1', texto: 'testar a consulta do Rating', feito: true, responsavel_id: USER_A, concluido_por: USER_A, feito_por: USER_A },
      { id: 'item-2', texto: 'incluir o raio no sistema', feito: true, responsavel_id: USER_A, concluido_por: USER_A, feito_por: USER_A },
    ],
  }
  assert.equal(utils.isFreeTeamTask(task), true)
  assert.equal(utils.hasChecklistOwnedByOther(task, USER_B), true)
  assert.equal(utils.hasChecklistOwnedByOther(task, USER_A), false)
})

test('lista com todos os itens delegados a outra pessoa não aparece como livre para um terceiro, mesmo com checklist filtrado vazio', () => {
  const task = {
    id: '44444444-4444-4444-8444-444444444444',
    org_id: '33333333-3333-4333-8333-333333333333',
    escopo: 'equipe',
    modo_distribuicao: 'livre_equipe',
    status: 'em_progresso',
    aceita_por: null,
    criado_por: USER_B,
    checklist: [
      { id: 'item-1', texto: 'Cadastrar no SISTDC', feito: false, responsavel_id: USER_B, responsavel_nome: 'Raíssa Aragão' },
      { id: 'item-2', texto: 'Gerar contrato', feito: false, responsavel_id: USER_B, responsavel_nome: 'Raíssa Aragão' },
      { id: 'item-3', texto: 'Enviar ao cliente', feito: false, responsavel_id: USER_B, responsavel_nome: 'Raíssa Aragão' },
    ],
  }
  // USER_A (terceiro membro, sem nenhum item seu) precisa continuar vendo só
  // o que é dele — aqui, nada — mas o sinal de "já tem dono" tem que vir
  // junto mesmo assim, senão o front-end acha que a lista está livre.
  const sanitizado = utils.sanitizeTaskForUser(task, {
    userId: USER_A,
    orgId: task.org_id,
    role: 'membro',
  })
  assert.deepEqual(sanitizado.checklist, [])
  assert.equal(sanitizado.possui_itens_atribuidos, true)

  // Para quem já é dono dos itens (USER_B), o checklist normal continua vindo.
  const sanitizadoDono = utils.sanitizeTaskForUser(task, {
    userId: USER_B,
    orgId: task.org_id,
    role: 'membro',
  })
  assert.equal(sanitizadoDono.checklist.length, 3)
  assert.equal(sanitizadoDono.possui_itens_atribuidos, true)
})

test('ranking prioriza quem concluiu, não uma reatribuição posterior', () => {
  const executor = utils.checklistExecutorId(
    {
      feito: true,
      responsavel_id: USER_B,
      concluido_por: USER_A,
      feito_por: USER_A,
    },
    { responsavel_id: USER_B },
  )
  assert.equal(executor, USER_A)
})


test('reatribuição remove poder de alteração do executor histórico sem apagar sua autoria', () => {
  const item = {
    feito: true,
    responsavel_id: USER_B,
    concluido_por: USER_A,
    feito_por: USER_A,
  }
  const task = { responsavel_id: USER_B, criado_por: USER_B }
  assert.equal(utils.isChecklistItemExecutor(task, item, USER_A), false)
  assert.equal(utils.isChecklistItemExecutor(task, item, USER_B), true)
  assert.equal(utils.checklistExecutorId(item, task), USER_A)
})
