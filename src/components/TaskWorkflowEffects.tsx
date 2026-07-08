import { useEffect } from 'react'

const APPROVE_TEXTS = new Set(['Aprovar', 'Aprovar lista', 'Aprovar item', 'Aprovar parte'])

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

    document.addEventListener('click', onClick, true)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      document.removeEventListener('click', onClick, true)
      observer.disconnect()
    }
  }, [])

  return null
}
