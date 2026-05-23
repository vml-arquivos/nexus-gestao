import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Setup from './components/Setup'
import { ToastProvider } from './components/ui'
import { isConfigured, checkUpcomingReminders, requestPushPermission } from './lib/store'

import Dashboard from './pages/Dashboard'
import Equipe from './pages/Equipe'
import Tarefas from './pages/Tarefas'
import Agenda from './pages/Agenda'
import Financeiro from './pages/Financeiro'
import Documentos from './pages/Documentos'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'

export default function App() {
  const [configured, setConfigured] = useState(isConfigured())

  useEffect(() => {
    if (!configured) return
    requestPushPermission()
    checkUpcomingReminders()
    const interval = setInterval(checkUpcomingReminders, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [configured])

  if (!configured) {
    return (
      <>
        <ToastProvider />
        <Setup onDone={() => setConfigured(true)} />
      </>
    )
  }

  return (
    <BrowserRouter>
      <ToastProvider />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/tarefas" element={<Tarefas />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/documentos" element={<Documentos />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
