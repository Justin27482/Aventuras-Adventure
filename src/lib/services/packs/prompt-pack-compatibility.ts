import { templateEngine } from '$lib/services/templates/engine'
import { variableRegistry } from '$lib/services/templates/variables'
import type { PackTemplate } from './types'

export interface PromptTemplateCompatibilityIssue {
  templateId: string
  type: 'syntax' | 'unknown_variable'
  message: string
}

export interface PromptPackCompatibilityReport {
  compatible: boolean
  missingTemplateIds: string[]
  issues: PromptTemplateCompatibilityIssue[]
}

export function checkPromptPackCompatibility(
  templates: PackTemplate[],
  expectedTemplateIds: string[],
): PromptPackCompatibilityReport {
  const presentIds = new Set(templates.map((template) => template.templateId))
  const missingTemplateIds = expectedTemplateIds.filter((templateId) => !presentIds.has(templateId))
  const issues: PromptTemplateCompatibilityIssue[] = []

  for (const template of templates) {
    const parsed = templateEngine.parseTemplate(template.content)
    if (!parsed.success) {
      issues.push({
        templateId: template.templateId,
        type: 'syntax',
        message: parsed.error ?? 'Template syntax is invalid',
      })
      continue
    }

    for (const variableName of templateEngine.extractVariableNames(template.content)) {
      const rootName = variableName.split('.')[0]
      if (!variableRegistry.has(rootName)) {
        issues.push({
          templateId: template.templateId,
          type: 'unknown_variable',
          message: `Template references unknown variable '${rootName}'`,
        })
      }
    }
  }

  return {
    compatible: missingTemplateIds.length === 0 && issues.length === 0,
    missingTemplateIds,
    issues,
  }
}
