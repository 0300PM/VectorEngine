import type { ValidationIssue } from '@/types/engine'

export class VectorEngineError extends Error {
  readonly code: string
  readonly issues: ValidationIssue[]

  constructor(code: string, message: string, issues: ValidationIssue[] = []) {
    super(message)
    this.name = 'VectorEngineError'
    this.code = code
    this.issues = issues
  }
}
