import express from 'express'
import scoringRouter from './tarefasScoring'

const application = (express as any).application

if (application?.use && !application.__nexusScoringInstalled) {
  const originalUse = application.use
  application.__nexusScoringInstalled = true
  application.use = function (...args: any[]) {
    if (!this.__nexusScoringMounted && args[0] === '/api/tarefas') {
      this.__nexusScoringMounted = true
      originalUse.call(this, '/api/tarefas', scoringRouter)
    }
    return originalUse.apply(this, args)
  }
}
