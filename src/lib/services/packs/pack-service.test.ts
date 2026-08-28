import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDatabase } = vi.hoisted(() => ({
  mockDatabase: {
    getDefaultPack: vi.fn(),
    createPack: vi.fn(),
    getAllPacks: vi.fn(),
    getPackTemplates: vi.fn(),
    getPackTemplate: vi.fn(),
    setPackTemplateContent: vi.fn(),
  },
}))

vi.mock('$lib/services/database', () => ({
  database: mockDatabase,
}))

vi.mock('$lib/services/prompts/templates', () => ({
  PROMPT_TEMPLATES: [
    { id: 'adventure', name: 'Adventure', category: 'story', content: 'ADVENTURE_CONTENT_V2' },
    {
      id: 'agency-core',
      name: 'Agency Core',
      category: 'agency',
      content: 'AGENCY_CORE_CONTENT_V2',
      userContent: 'AGENCY_CORE_USER_V2',
    },
    {
      id: 'new-template',
      name: 'New Template',
      category: 'story',
      content: 'NEW_TEMPLATE_CONTENT',
    },
  ],
}))

import { packService } from './pack-service'

function templateRow(templateId: string, content: string) {
  return {
    id: `row-${templateId}`,
    packId: 'custom-pack',
    templateId,
    content,
    contentHash: 'irrelevant-for-these-tests',
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('packService.ensurePackTemplatesComplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing for the default pack', async () => {
    await packService.ensurePackTemplatesComplete('default-pack')
    expect(mockDatabase.getPackTemplates).not.toHaveBeenCalled()
  })

  it('does nothing for a falsy pack id', async () => {
    await packService.ensurePackTemplatesComplete('')
    expect(mockDatabase.getPackTemplates).not.toHaveBeenCalled()
  })

  it('fills in only the templates missing from the custom pack, leaving existing ones untouched', async () => {
    // Custom pack already has 'adventure' (with user-customized content) but is missing
    // 'agency-core'/'agency-core-user' and the newly-introduced 'new-template'.
    mockDatabase.getPackTemplates.mockResolvedValue([
      templateRow('adventure', 'MY_CUSTOM_ADVENTURE_TEXT'),
    ])

    await packService.ensurePackTemplatesComplete('custom-pack')

    // Never touches the existing 'adventure' entry.
    expect(mockDatabase.setPackTemplateContent).not.toHaveBeenCalledWith(
      'custom-pack',
      'adventure',
      expect.anything(),
    )

    // Backfills every missing template id (including the '-user' variant) with the default content.
    expect(mockDatabase.setPackTemplateContent).toHaveBeenCalledWith(
      'custom-pack',
      'agency-core',
      'AGENCY_CORE_CONTENT_V2',
    )
    expect(mockDatabase.setPackTemplateContent).toHaveBeenCalledWith(
      'custom-pack',
      'agency-core-user',
      'AGENCY_CORE_USER_V2',
    )
    expect(mockDatabase.setPackTemplateContent).toHaveBeenCalledWith(
      'custom-pack',
      'new-template',
      'NEW_TEMPLATE_CONTENT',
    )
    expect(mockDatabase.setPackTemplateContent).toHaveBeenCalledTimes(3)
  })

  it('does nothing when the custom pack already has every baseline template', async () => {
    mockDatabase.getPackTemplates.mockResolvedValue([
      templateRow('adventure', 'MY_CUSTOM_ADVENTURE_TEXT'),
      templateRow('agency-core', 'MY_CUSTOM_AGENCY_TEXT'),
      templateRow('agency-core-user', 'MY_CUSTOM_AGENCY_USER_TEXT'),
      templateRow('new-template', 'MY_CUSTOM_NEW_TEMPLATE_TEXT'),
    ])

    await packService.ensurePackTemplatesComplete('custom-pack')

    expect(mockDatabase.setPackTemplateContent).not.toHaveBeenCalled()
  })
})
