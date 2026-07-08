import { useEffect } from 'react'

const APPROVE_TEXTS = new Set(['Aprovar', 'Aprovar lista', 'Aprovar item', 'Aprovar parte'])

function normalizedText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').replace(/\s+Surpresa$/, '').trim().toLocaleLowerCase('pt-BR')
}

function labelOf(button: HTMLButtonElement) {
  return String(button.textContent || '').replace(/\s+/g, ' ').trim()
}

function closeTaskModal() {
  const content = document.querySelector<HTMLElement>('.task-detail-modal')
  const dialog = content?.closest<HTMLElement>('.modal-box, .modal-card, [role="dialog"]')
  const close = dialog?.querySelector<HTMLButtonElement>('.modal-close, button[aria-label="Fechar"]')
  close?.click()
}

function isApprovalSuccess(node: Node) {
  const text = node.textContent || ''
  // Só a aprovação final da lista inteira fecha o modal automaticamente.
  // A aprovação de um item isolado ("Item aprovado...") NÃO fecha mais o
  // modal de propósito — o gestor pode revisar e aprovar vários itens da
  // mesma lista numa única sessão, sem precisar reabrir a tela a cada clique.
  return text.includes('Tarefa aprovada e pontuação')
}

function syncTaskUi() {
  document.querySelectorAll<HTMLElement>('.task-detail-modal').forEach(modal => {
    const cards = Array.from(modal.querySelectorAll<HTMLElement>('.task-check-item'))
    const approvedTexts = new Set<string>()

    cards.forEach(card => {
      const approved = Boolean(
        card.querySelector('[data-checklist-status="aprovada"], [data-approval-status="aprovada"]') ||
        card.textContent?.includes('Aprovada · pontos liberados')
      )
      card.classList.toggle('task-runtime-archived', approved)
      if (approved) {
        const text = normalizedText(card.querySelector<HTMLElement>('.task-check-text')?.textContent)
        if (text) approvedTexts.add(text)
      }
    })

    const editor = modal.querySelector<HTMLElement>('.task-inline-editor')
    const allApproved = cards.length > 0 && cards.every(card => card.classList.contains('task-runtime-archived'))
    editor?.classList.toggle('task-runtime-append-only', allApproved)

    modal.querySelectorAll<HTMLElement>('.task-inline-checklist-row').forEach(row => {
      const title = normalizedText(row.querySelector<HTMLInputElement>('input.form-input')?.value)
      row.classList.toggle('task-runtime-archived-row', Boolean(title && approvedTexts.has(title)))
    })
  })
}

export default function TaskWorkflowEffects() {
  useEffect(() => {
    let pendingApproval = false

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button')
      if (!button || !button.closest('.task-detail-modal')) return
      if (!APPROVE_TEXTS.has(labelOf(button))) return
      if (button.dataset.approvalBusy === '1') {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      button.dataset.approvalBusy = '1'
      pendingApproval = true
      queueMicrotask(() => {
        if (button.isConnected && button.dataset.approvalBusy === '1') button.disabled = true
      })
      window.setTimeout(() => {
        if (button.isConnected && button.dataset.approvalBusy === '1') {
          delete button.dataset.approvalBusy
          button.disabled = false
        }
        pendingApproval = false
      }, 12000)
    }

    const observer = new MutationObserver(records => {
      syncTaskUi()
      if (!pendingApproval) return
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!isApprovalSuccess(node)) continue
          pendingApproval = false
          window.setTimeout(closeTaskModal, 80)
          return
        }
      }
    })

    syncTaskUi()
    document.addEventListener('click', onClick, true)
    document.addEventListener('input', syncTaskUi, true)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('input', syncTaskUi, true)
      observer.disconnect()
    }
  }, [])

  return null
}
