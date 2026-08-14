<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { createDebouncedSave } from '$lib/utils/debounce'
  import { settings } from '$lib/stores/settings.svelte'
  import { Label } from '$lib/components/ui/label'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Autocomplete } from '$lib/components/ui/autocomplete'
  import { Slider } from '$lib/components/ui/slider'
  import { Switch } from '$lib/components/ui/switch'
  import {
    RotateCcw,
    Info,
    Plus,
    Copy,
    Eye,
    EyeOff,
    ChevronRight,
    Check,
    Trash2,
  } from 'lucide-svelte'
  import { Textarea } from '$lib/components/ui/textarea'
  import {
    listImageModels,
    listImageModelsByProvider,
    getProviderSamplerInfo,
    listLoras,
    listEmbeddings,
    generateImage,
    ComfyMode,
    type ImageModelInfo,
  } from '$lib/services/ai/image'
  import {
    validateApiWorkflow,
    detectWorkflowFields,
    fetchModelList,
    clearComfyCacheForUrl,
  } from '$lib/services/ai/image/providers/comfy'
  import type { ComfyCustomWorkflow } from '$lib/services/ai/image/providers/types'
  import ImageModelSelect from '$lib/components/settings/ImageModelSelect.svelte'
  import type {
    ImageProfile,
    ImageProviderType,
    APIProfile,
    SmartLoraCatalogEntry,
  } from '$lib/types'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Alert from '$lib/components/ui/alert'
  import { Card, CardContent } from '$lib/components/ui/card'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import { SvelteSet } from 'svelte/reactivity'
  import IconRow from '$lib/components/ui/icon-row.svelte'

  type ComfyLoraConfig = {
    id: string
    name: string
    strengthModel: number
    strengthClip: number
  }

  type BaseModelFamily = 'auto' | 'sd15' | 'sd_turbo' | 'sdxl' | 'pony' | 'illustrious' | 'flux'
  type SizeOption = { value: string; label: string }

  const baseModelFamilyItems: { value: BaseModelFamily; label: string }[] = [
    { value: 'auto', label: 'Auto-detect from selected model' },
    { value: 'sd15', label: 'SD1.5' },
    { value: 'sd_turbo', label: 'SD Turbo' },
    { value: 'sdxl', label: 'SDXL' },
    { value: 'pony', label: 'Pony' },
    { value: 'illustrious', label: 'Illustrious (IL)' },
    { value: 'flux', label: 'Flux' },
  ]

  const imageStyles = [
    { value: 'image-style-soft-anime', label: 'Soft Anime' },
    { value: 'image-style-semi-realistic', label: 'Semi-realistic Anime' },
    { value: 'image-style-photorealistic', label: 'Photorealistic' },
  ] as const

  const imageSizes = [
    { value: '512x512', label: '512x512 (Faster)' },
    { value: '1024x1024', label: '1024x1024 (Higher Quality)' },
    { value: '1536x1536', label: '1536x1536 (High Quality)' },
    { value: '2048x2048', label: '2048x2048 (Highest Quality)' },
  ] as const

  const backgroundSizes = (() => {
    const sizes = [
      { value: '1280x720', label: '1280x720 (Widescreen)' },
      { value: '720x1280', label: '720x1280 (Portrait)' },
    ]
    if (typeof window !== 'undefined') {
      const screenRes = `${window.screen.width}x${window.screen.height}`
      if (!sizes.some((s) => s.value === screenRes)) {
        sizes.unshift({ value: screenRes, label: `${screenRes} (Screen)` })
      }
    }
    return sizes
  })()

  const modelFamilySizePresets: Record<
    Exclude<BaseModelFamily, 'auto'>,
    {
      story: string[]
      portrait: string[]
      background: string[]
    }
  > = {
    sd15: {
      story: ['512x512', '512x768', '768x512', '640x832', '832x640', '704x704'],
      portrait: ['512x768', '576x864', '640x960', '704x1056'],
      background: ['768x512', '832x512', '960x544', '1024x576', '1152x640'],
    },
    sd_turbo: {
      story: ['512x512', '640x640', '768x768', '512x768', '768x512', '640x832', '832x640'],
      portrait: ['512x768', '576x864', '640x960', '768x1152'],
      background: ['768x512', '832x512', '960x544', '1024x576', '1152x640'],
    },
    sdxl: {
      story: ['1024x1024', '832x1216', '1216x832', '896x1152', '1152x896', '768x1344', '1344x768'],
      portrait: ['832x1216', '896x1152', '768x1344', '1024x1536'],
      background: ['1216x832', '1152x896', '1344x768', '1536x864', '1600x900'],
    },
    pony: {
      story: ['1024x1024', '832x1216', '1216x832', '896x1152', '1152x896', '768x1344', '1344x768'],
      portrait: ['832x1216', '896x1152', '768x1344', '1024x1536'],
      background: ['1216x832', '1152x896', '1344x768', '1536x864', '1600x900'],
    },
    illustrious: {
      story: ['1024x1024', '832x1216', '1216x832', '896x1152', '1152x896', '768x1344', '1344x768'],
      portrait: ['832x1216', '896x1152', '768x1344', '1024x1536'],
      background: ['1216x832', '1152x896', '1344x768', '1536x864', '1600x900'],
    },
    flux: {
      story: ['1024x1024', '768x1344', '1344x768', '896x1152', '1152x896', '832x1216', '1216x832'],
      portrait: ['768x1344', '832x1216', '896x1152', '1024x1536'],
      background: ['1344x768', '1216x832', '1536x864', '1600x900', '1792x1024'],
    },
  }

  function parseSize(size: string): { width: number; height: number } | null {
    const match = size.match(/^(\d+)x(\d+)$/)
    if (!match) return null
    return { width: Number(match[1]), height: Number(match[2]) }
  }

  function sizeLabel(size: string): string {
    const parsed = parseSize(size)
    if (!parsed) return size
    if (parsed.width === parsed.height) return `${size} (Square)`
    return parsed.height > parsed.width ? `${size} (Portrait)` : `${size} (Landscape)`
  }

  function inferModelFamily(
    profileProviderType: ImageProviderType,
    modelId: string,
    modelName: string,
    modelDescription?: string,
  ): Exclude<BaseModelFamily, 'auto'> {
    const source = `${modelId} ${modelName} ${modelDescription ?? ''}`.toLowerCase()

    if (source.includes('flux')) return 'flux'
    if (source.includes('illustrious') || source.includes(' il ') || source.includes('ilxl')) {
      return 'illustrious'
    }
    if (source.includes('pony')) return 'pony'
    if (source.includes('sd turbo') || source.includes('sdturbo') || source.includes('turbo')) {
      return 'sd_turbo'
    }
    if (source.includes('sdxl') || source.includes('xl')) return 'sdxl'
    if (source.includes('sd1.5') || source.includes('sd 1.5') || source.includes('v1-5')) {
      return 'sd15'
    }

    if (profileProviderType === 'comfyui' && modelId.startsWith('unet:')) {
      return 'flux'
    }

    return 'sdxl'
  }

  function getPresetSizesByType(
    family: Exclude<BaseModelFamily, 'auto'>,
    type: 'standard' | 'portrait' | 'reference' | 'background' | 'testing',
  ): string[] {
    if (type === 'portrait') return modelFamilySizePresets[family].portrait
    if (type === 'background') return modelFamilySizePresets[family].background
    return modelFamilySizePresets[family].story
  }

  function toSizeItems(sizes: string[]): SizeOption[] {
    return sizes.map((size) => ({ value: size, label: sizeLabel(size) }))
  }

  function getFamilyLabel(family: Exclude<BaseModelFamily, 'auto'>): string {
    switch (family) {
      case 'sd15':
        return 'SD1.5'
      case 'sd_turbo':
        return 'SD Turbo'
      case 'sdxl':
        return 'SDXL'
      case 'pony':
        return 'Pony'
      case 'illustrious':
        return 'Illustrious (IL)'
      case 'flux':
        return 'Flux'
    }
  }

  function getProfileIdForType(
    type: 'standard' | 'portrait' | 'reference' | 'background' | 'testing',
  ): string | null {
    switch (type) {
      case 'standard':
        return settings.systemServicesSettings.imageGeneration.profileId
      case 'portrait':
        return settings.systemServicesSettings.imageGeneration.portraitProfileId
      case 'reference':
        return settings.systemServicesSettings.imageGeneration.referenceProfileId
      case 'background':
        return settings.systemServicesSettings.imageGeneration.backgroundProfileId
      case 'testing':
        return testProfileId
    }
  }

  function getEffectiveFamilyInfo(
    type: 'standard' | 'portrait' | 'reference' | 'background' | 'testing',
  ): { source: 'auto' | 'override'; family: Exclude<BaseModelFamily, 'auto'> } | null {
    const profileId = getProfileIdForType(type)
    if (!profileId) return null

    const profile = settings.getImageProfile(profileId)
    if (!profile) return null

    const models = activeProfilesModelInfo[profileId] || []
    const modelInfo = models.find((m) => m.id === profile.model)
    const overrideFamily =
      typeof profile.providerOptions?.baseModelFamilyOverride === 'string'
        ? (profile.providerOptions.baseModelFamilyOverride as BaseModelFamily)
        : 'auto'

    const inferredFamily = inferModelFamily(
      profile.providerType,
      modelInfo?.id ?? profile.model,
      modelInfo?.name ?? profile.model,
      modelInfo?.description,
    )

    if (overrideFamily !== 'auto' && baseModelFamilyItems.some((f) => f.value === overrideFamily)) {
      return {
        source: 'override',
        family: overrideFamily as Exclude<BaseModelFamily, 'auto'>,
      }
    }

    return {
      source: 'auto',
      family: inferredFamily,
    }
  }

  const standardFamilyInfo = $derived(getEffectiveFamilyInfo('standard'))
  const referenceFamilyInfo = $derived(getEffectiveFamilyInfo('reference'))
  const portraitFamilyInfo = $derived(getEffectiveFamilyInfo('portrait'))
  const backgroundFamilyInfo = $derived(getEffectiveFamilyInfo('background'))

  const providerTypes: { value: ImageProviderType; label: string }[] = [
    { value: 'nanogpt', label: 'NanoGPT' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'chutes', label: 'Chutes' },
    { value: 'pollinations', label: 'Pollinations' },
    { value: 'google', label: 'Google AI Studio' },
    { value: 'zhipu', label: 'Zhipu CogView' },
    { value: 'comfyui', label: 'ComfyUI' },
    { value: 'a1111', label: 'A1111 / SD.cpp / Kobold' },
  ]
  const profileModes = [
    { value: ComfyMode.CustomWorkflow, label: 'Custom Workflow' },
    { value: ComfyMode.BasicTxt2Img, label: 'Basic Text to Image' },
    { value: ComfyMode.LoraTxt2Img, label: 'LoRA Text to Image' },
    { value: ComfyMode.UnetTxt2Img, label: 'UNet / Flux Text to Image' },
  ] as const

  const clipTypeItems = [
    { value: 'lumina2', label: 'Lumina 2' },
    { value: 'flux', label: 'Flux' },
    { value: 'sd3', label: 'SD3' },
    { value: 'stable_audio', label: 'Stable Audio' },
    { value: 'mochi', label: 'Mochi' },
    { value: 'ltxv', label: 'LTX Video' },
    { value: 'cosmos', label: 'Cosmos' },
    { value: 'wan', label: 'Wan' },
    { value: 'hidream', label: 'HiDream' },
  ] as const
  const weightDtypeItems = [
    { value: 'default', label: 'default' },
    { value: 'fp8_e4m3fn', label: 'fp8_e4m3fn' },
    { value: 'fp8_e4m3fn_fast', label: 'fp8_e4m3fn_fast' },
    { value: 'fp8_e5m2', label: 'fp8_e5m2' },
  ] as const

  // Tab state
  let activeTab = $state<'profiles' | 'general' | 'characters' | 'backgrounds' | 'testing'>(
    'profiles',
  )

  // Maps profile type to the corresponding settings key
  const profileIdKey = {
    standard: 'profileId',
    portrait: 'portraitProfileId',
    reference: 'referenceProfileId',
    background: 'backgroundProfileId',
  } as const satisfies Record<string, keyof typeof settings.systemServicesSettings.imageGeneration>

  // Handle profile change
  function onProfileChange(
    profileId: string,
    type: 'standard' | 'portrait' | 'reference' | 'background',
  ) {
    settings.systemServicesSettings.imageGeneration[profileIdKey[type]] = profileId
    settings.saveSystemServicesSettings()
  }

  // Get the currently selected image profile for a type
  function getSelectedImageProfile(
    type: 'standard' | 'portrait' | 'reference' | 'background',
  ): ImageProfile | undefined {
    const profileId = settings.systemServicesSettings.imageGeneration[profileIdKey[type]]
    return profileId ? settings.getImageProfile(profileId) : undefined
  }

  // ===== Image Profile CRUD =====
  let editingProfileId = $state<string | null>(null)
  const isEditingReferenceProfile = $derived(
    editingProfileId !== null &&
      editingProfileId === settings.systemServicesSettings.imageGeneration.referenceProfileId,
  )
  let isNewProfile = $state(false)
  let suppressAutoSave = false
  let profileName = $state('')
  let profileProviderType = $state<ImageProviderType>('nanogpt')
  let profileApiKey = $state('')
  let profileBaseUrl = $state('')
  let profileBaseModelFamilyOverride = $state<BaseModelFamily>('auto')
  let showApiKey = $state(false)
  let showCopyDropdown = $state(false)
  let openProfileIds = new SvelteSet<string>()

  // Profile form model state
  let profileModel = $state('')
  let profileModels = $state<ImageModelInfo[]>([])
  const referenceProfileImg2ImgWarning = $derived(
    isEditingReferenceProfile &&
      !!profileModel &&
      profileModels.find((m) => m.id === profileModel)?.supportsImg2Img === false,
  )
  let isLoadingProfileModels = $state(false)
  let profileModelsError = $state<string | null>(null)

  // ComfyUI specific state
  let profileSampler = $state('dpmpp_2m_sde_gpu')
  let profileScheduler = $state('sgm_uniform')
  let profileMode = $state<string>(ComfyMode.BasicTxt2Img)
  let profileCfg = $state(1)
  let profileSteps = $state(6)
  let profilePositivePrompt = $state('')
  let profileNegativePrompt = $state('')
  let profileSamplers = $state<{ value: string; label: string }[]>([])
  let profileSchedulers = $state<{ value: string; label: string }[]>([])
  let profileLoras = $state<ComfyLoraConfig[]>([])
  let selectedLoraName = $state('')
  let availableLoras = $state<string[]>([])
  let selectedEmbeddingName = $state('')
  let availableEmbeddings = $state<string[]>([])
  const { trigger: triggerAutoSave, flush: flushAutoSave } = createDebouncedSave(autoSaveProfile)

  // Custom workflow state
  let profileCustomWorkflow = $state<ComfyCustomWorkflow | null>(null)
  // Holds parsed workflow data while the user resolves an ambiguous picker — not yet saved to profileCustomWorkflow
  let pendingWorkflowData = $state<{
    workflow: ComfyCustomWorkflow['workflow']
    seedPath: string
    outputNodeId: string
    negativePromptPath: string | null
  } | null>(null)
  let workflowAmbiguousNodes = $state<
    Array<{
      nodeId: string
      title: string
      path: string
      textPreview: string
      kSamplerSlot: string | null
    }>
  >([])
  let workflowPickerSelection = $state<string>('')
  let workflowError = $state<string | null>(null)
  let workflowFileName = $state<string | null>(null)

  // Tracks the baseUrl active when the last cache population happened; used to
  // detect URL changes and evict stale cache entries in comfy.ts.
  let prevComfyBaseUrl: string | null = null

  // UNet mode specific state
  let profileClipName = $state('')
  let profileVaeName = $state('')
  let profileClipType = $state('lumina2')
  let profileWeightDtype = $state('default')
  let availableClips = $state<string[]>([])
  let availableVaes = $state<string[]>([])
  let isLoadingUnetModels = $state(false)
  const clipItems = $derived(availableClips.map((c) => ({ value: c, label: c })))
  const vaeItems = $derived(availableVaes.map((v) => ({ value: v, label: v })))

  const needsWorkflow = $derived(
    profileProviderType === 'comfyui' &&
      profileMode === ComfyMode.CustomWorkflow &&
      (!profileCustomWorkflow || !!pendingWorkflowData),
  )
  const canSaveProfile = $derived(!!profileName.trim() && !needsWorkflow)

  onDestroy(() => flushAutoSave())

  // Model info cache for active profiles
  let activeProfilesModelInfo = $state<Record<string, ImageModelInfo[]>>({})
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const loadingProfileModelsIds = new Set<string>()

  // Load models for active profiles to get resolution info
  async function loadModelsForProfile(profileId: string) {
    if (loadingProfileModelsIds.has(profileId)) return
    loadingProfileModelsIds.add(profileId)
    try {
      activeProfilesModelInfo[profileId] = await listImageModels(profileId)
    } finally {
      loadingProfileModelsIds.delete(profileId)
    }
  }

  // Effect to load models for all selected profiles
  $effect(() => {
    const profilesToLoad = [
      settings.systemServicesSettings.imageGeneration.profileId,
      settings.systemServicesSettings.imageGeneration.portraitProfileId,
      settings.systemServicesSettings.imageGeneration.referenceProfileId,
      settings.systemServicesSettings.imageGeneration.backgroundProfileId,
      testProfileId,
    ].filter(Boolean) as string[]

    // Read profile IDs reactively above, but check cache without tracking
    // to avoid re-running when loadModelsForProfile writes results back
    untrack(() => {
      for (const id of profilesToLoad) {
        if (!activeProfilesModelInfo[id]) {
          loadModelsForProfile(id)
        }
      }
    })
  })

  /**
   * Get supported sizes for a specific profile type/ID
   */
  function getSupportedSizes(
    type: 'standard' | 'portrait' | 'reference' | 'background' | 'testing',
  ) {
    let profileId: string | null = null
    switch (type) {
      case 'standard':
        profileId = settings.systemServicesSettings.imageGeneration.profileId
        break
      case 'portrait':
        profileId = settings.systemServicesSettings.imageGeneration.portraitProfileId
        break
      case 'reference':
        profileId = settings.systemServicesSettings.imageGeneration.referenceProfileId
        break
      case 'background':
        profileId = settings.systemServicesSettings.imageGeneration.backgroundProfileId
        break
      case 'testing':
        profileId = testProfileId
        break
    }

    if (!profileId) return type === 'background' ? backgroundSizes : imageSizes

    const profile = settings.getImageProfile(profileId)
    if (!profile) return type === 'background' ? backgroundSizes : imageSizes

    const models = activeProfilesModelInfo[profileId] || []
    const modelInfo = models.find((m) => m.id === profile.model)

    const overrideFamily =
      typeof profile.providerOptions?.baseModelFamilyOverride === 'string'
        ? (profile.providerOptions.baseModelFamilyOverride as BaseModelFamily)
        : 'auto'

    const inferredFamily = inferModelFamily(
      profile.providerType,
      modelInfo?.id ?? profile.model,
      modelInfo?.name ?? profile.model,
      modelInfo?.description,
    )

    const effectiveFamily =
      overrideFamily !== 'auto' && baseModelFamilyItems.some((f) => f.value === overrideFamily)
        ? (overrideFamily as Exclude<BaseModelFamily, 'auto'>)
        : inferredFamily

    const familyPresetSizes = getPresetSizesByType(effectiveFamily, type)
    const familyPresetItems = toSizeItems(familyPresetSizes)

    if (modelInfo?.supportsSizes?.length) {
      // Safety: Filter for valid WIDTHxHEIGHT format
      const validSizes = modelInfo.supportsSizes.filter((size) => /^\d+x\d+$/.test(size))

      if (validSizes.length > 0) {
        const constrainedPreset = familyPresetSizes.filter((size) => validSizes.includes(size))
        if (constrainedPreset.length >= 4) {
          return toSizeItems(constrainedPreset)
        }

        const mergedSizes = [...constrainedPreset]
        for (const size of validSizes) {
          if (!mergedSizes.includes(size)) mergedSizes.push(size)
          if (mergedSizes.length >= 8) break
        }
        if (mergedSizes.length > 0) {
          return toSizeItems(mergedSizes)
        }
      }
    }

    return familyPresetItems.length > 0
      ? familyPresetItems
      : type === 'background'
        ? backgroundSizes
        : imageSizes
  }

  // Testing state
  let testProfileId = $state<string | null>(null)
  let testPrompt = $state('')
  let testSize = $state('1024x1024')
  let isGeneratingTestImage = $state(false)
  let testImageResult = $state<string | null>(null)
  let testError = $state<string | null>(null)

  $effect(() => {
    // Clear stale test result when the profile changes
    void testProfileId
    testImageResult = null
    testError = null
  })

  // Derived supported sizes — computed once per reactive change, not twice per Autocomplete render
  const standardSizes = $derived(getSupportedSizes('standard'))
  const referenceSizes = $derived(getSupportedSizes('reference'))
  const portraitSizes = $derived(getSupportedSizes('portrait'))
  const bgSupportedSizes = $derived(getSupportedSizes('background'))
  const testingSizes = $derived(getSupportedSizes('testing'))

  // Derived LoRA items — avoids re-mapping on every render
  const loraItems = $derived(availableLoras.map((l) => ({ value: l, label: l })))
  const embeddingItems = $derived(availableEmbeddings.map((e) => ({ value: e, label: e })))

  // Load models for the profile form when provider/apiKey/baseUrl change
  let profileModelsReqId = 0

  async function loadProfileFormModels(
    providerType: ImageProviderType,
    apiKey: string,
    baseUrl: string,
    forceReload: boolean,
  ) {
    const effectiveBaseUrl = baseUrl || undefined
    const reqId = ++profileModelsReqId
    isLoadingProfileModels = true
    profileModelsError = null
    try {
      const models = await listImageModelsByProvider(
        providerType,
        apiKey,
        forceReload,
        effectiveBaseUrl,
      )
      // Discard stale results if a newer request has already started.
      if (reqId !== profileModelsReqId) return
      profileModels = models
    } catch (error) {
      if (reqId !== profileModelsReqId) return
      profileModelsError = error instanceof Error ? error.message : 'Failed to load models'
    } finally {
      if (reqId === profileModelsReqId) isLoadingProfileModels = false
    }
  }

  // Reactively load models when provider, apiKey, or (for ComfyUI) baseUrl changes in profile form.
  // Reactive deps are captured explicitly before untrack() so that reads inside the loader
  // functions (e.g. settings.apiSettings.llmTimeoutMs) are NOT accidentally tracked as
  // dependencies — which would cause the effect to re-run on unrelated settings changes.
  $effect(() => {
    if (editingProfileId && profileProviderType) {
      const providerType = profileProviderType
      const apiKey = profileApiKey
      const baseUrl = profileBaseUrl

      untrack(() => {
        loadProfileFormModels(providerType, apiKey, baseUrl, false)
        if (providerType === 'comfyui') {
          loadSamplerInfo(baseUrl || undefined, 'comfyui')
          loadLoras(baseUrl || undefined)
          loadEmbeddings(baseUrl || undefined)
        } else if (providerType === 'a1111') {
          loadSamplerInfo(baseUrl || undefined, 'a1111')
        } else {
          profileSamplers = []
          profileSchedulers = []
        }
      })
    }
  })

  async function loadSamplerInfo(baseUrl?: string, providerType: 'comfyui' | 'a1111' = 'comfyui') {
    const info = await getProviderSamplerInfo(baseUrl, providerType)
    if ((profileBaseUrl || undefined) !== baseUrl) return
    profileSamplers = info.samplers.map((s) => ({ value: s, label: s }))
    profileSchedulers = info.schedulers.map((s) => ({ value: s, label: s }))
  }

  async function loadLoras(baseUrl?: string) {
    const loras = await listLoras(baseUrl)
    if ((profileBaseUrl || undefined) !== baseUrl) return
    availableLoras = loras
  }

  async function loadEmbeddings(baseUrl?: string) {
    const embeddings = await listEmbeddings(baseUrl)
    if ((profileBaseUrl || undefined) !== baseUrl) return
    availableEmbeddings = embeddings
  }

  function addSelectedEmbeddingToNegativePrompt() {
    const name = selectedEmbeddingName.trim()
    if (!name) return
    profileNegativePrompt = profileNegativePrompt ? `${profileNegativePrompt}, ${name}` : name
    selectedEmbeddingName = ''
  }

  async function handleTestGenerate() {
    if (isGeneratingTestImage || !testProfileId || !testPrompt.trim()) return

    const profile = settings.getImageProfile(testProfileId)
    if (!profile) return

    const activeProfileId = testProfileId

    isGeneratingTestImage = true
    testError = null
    testImageResult = null

    try {
      const result = await generateImage({
        prompt: testPrompt.trim(),
        model: profile.model || '',
        size: testSize,
        profileId: profile.id,
      })

      if (testProfileId !== activeProfileId || !isGeneratingTestImage) return

      if (result.base64) {
        testImageResult = result.base64
      } else {
        testError = 'No image data returned'
      }
    } catch (e) {
      if (testProfileId !== activeProfileId || !isGeneratingTestImage) return
      testError = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      if (testProfileId === activeProfileId) {
        isGeneratingTestImage = false
      }
    }
  }

  // Builds the provider-specific options object from current form state
  function buildProviderOptions(): Record<string, any> {
    if (profileProviderType === 'a1111') {
      return {
        steps: profileSteps,
        cfg: profileCfg,
        negativePrompt: profileNegativePrompt,
        sampler: profileSampler,
        scheduler: profileScheduler,
        baseModelFamilyOverride: profileBaseModelFamilyOverride,
      }
    }
    if (profileProviderType !== 'comfyui') {
      return {
        baseModelFamilyOverride: profileBaseModelFamilyOverride,
      }
    }
    const opts: Record<string, any> = {
      sampler: profileSampler,
      scheduler: profileScheduler,
      mode: profileMode,
      cfg: profileCfg ?? 1,
      step: profileSteps ?? 6,
      positivePrompt: profilePositivePrompt,
      negativePrompt: profileNegativePrompt,
      baseModelFamilyOverride: profileBaseModelFamilyOverride,
    }
    if (profileLoras.length > 0) {
      opts.loras = profileLoras.map((lora) => ({
        name: lora.name,
        strengthModel: lora.strengthModel ?? 1,
        strengthClip: lora.strengthClip ?? 1,
      }))
    }
    if (profileCustomWorkflow) {
      opts.customWorkflow = profileCustomWorkflow
    }
    if (profileMode === ComfyMode.UnetTxt2Img) {
      if (profileClipName) opts.clipName = profileClipName
      if (profileVaeName) opts.vaeName = profileVaeName
      if (profileClipType) opts.clipType = profileClipType
      if (profileWeightDtype) opts.weightDtype = profileWeightDtype
    }
    return opts
  }

  // Save current profile edits (called when collapsible closes)
  async function autoSaveProfile() {
    if (isNewProfile || !editingProfileId || !canSaveProfile) return

    await settings.updateImageProfile(editingProfileId, {
      name: profileName.trim(),
      providerType: profileProviderType,
      apiKey: profileApiKey,
      baseUrl: profileBaseUrl || undefined,
      model: profileModel,
      providerOptions: buildProviderOptions(),
    })
  }

  $effect(() => {
    if (editingProfileId && !isNewProfile) {
      // Touch all form fields so Svelte tracks them as dependencies
      void [
        profileName,
        profileProviderType,
        profileApiKey,
        profileBaseUrl,
        profileBaseModelFamilyOverride,
        profileModel,
        profileSampler,
        profileScheduler,
        profileMode,
        profileCfg,
        profileSteps,
        profilePositivePrompt,
        profileNegativePrompt,
        profileLoras,
        profileCustomWorkflow,
        profileClipName,
        profileVaeName,
        profileClipType,
        profileWeightDtype,
        // a1111 fields reuse profileSteps, profileCfg, profileNegativePrompt, profileSampler
      ]
      // Skip the first run after startEditProfile populates the form
      if (suppressAutoSave) {
        suppressAutoSave = false
        return
      }
      triggerAutoSave()
    }
  })

  // Aliased for clarity in UI but uses the same logic
  function saveEditingProfile() {
    flushAutoSave()
  }

  function startNewProfile() {
    if (editingProfileId) {
      saveEditingProfile()
    }
    editingProfileId = crypto.randomUUID()
    isNewProfile = true
    profileName = ''
    profileProviderType = 'nanogpt'
    profileApiKey = ''
    profileBaseUrl = ''
    profileBaseModelFamilyOverride = 'auto'
    profileModel = ''
    profileModels = []
    profileSampler = 'dpmpp_2m_sde_gpu'
    profileScheduler = 'sgm_uniform'
    profileMode = ComfyMode.BasicTxt2Img
    profileCfg = 7
    profileSteps = 20
    profilePositivePrompt = ''
    profileNegativePrompt = ''
    profileLoras = []
    selectedLoraName = ''
    selectedEmbeddingName = ''
    availableEmbeddings = []
    prevComfyBaseUrl = null
    profileCustomWorkflow = null
    pendingWorkflowData = null
    workflowAmbiguousNodes = []
    workflowPickerSelection = ''
    workflowError = null
    workflowFileName = null
    profileClipName = ''
    profileVaeName = ''
    profileClipType = 'lumina2'
    profileWeightDtype = 'default'
    availableClips = []
    availableVaes = []
    showApiKey = false
    showCopyDropdown = false
    openProfileIds.clear()
  }

  function startEditProfile(profile: ImageProfile) {
    if (editingProfileId && editingProfileId !== profile.id) {
      saveEditingProfile()
    }
    suppressAutoSave = true
    editingProfileId = profile.id
    isNewProfile = false
    profileName = profile.name
    profileProviderType = profile.providerType
    profileApiKey = profile.apiKey
    prevComfyBaseUrl = null
    profileBaseUrl = profile.baseUrl || ''
    profileBaseModelFamilyOverride =
      typeof profile.providerOptions?.baseModelFamilyOverride === 'string'
        ? (profile.providerOptions.baseModelFamilyOverride as BaseModelFamily)
        : 'auto'
    profileModel = profile.model || ''
    profileModels = []

    if (profile.providerType === 'a1111') {
      const opts = profile.providerOptions || {}
      profileSteps = Number(opts.steps) || 20
      profileCfg = Number(opts.cfg) || 7
      profileNegativePrompt = (opts.negativePrompt as string) || ''
      profileSampler = (opts.sampler as string) || 'Euler a'
      profileScheduler = (opts.scheduler as string) || 'karras'
    }

    if (profile.providerType === 'comfyui') {
      const opts = profile.providerOptions || {}
      profileSampler = (opts.sampler as string) || 'dpmpp_2m_sde_gpu'
      profileScheduler = (opts.scheduler as string) || 'sgm_uniform'
      profileMode = (opts.mode as string) || ComfyMode.BasicTxt2Img
      profileCfg = Number(opts.cfg) || 1
      profileSteps = Number(opts.step) || 6
      profilePositivePrompt = (opts.positivePrompt as string) || ''
      profileNegativePrompt = (opts.negativePrompt as string) || ''
      profileCustomWorkflow = (opts.customWorkflow as ComfyCustomWorkflow) || null
      pendingWorkflowData = null
      workflowFileName = profileCustomWorkflow ? 'Loaded from profile' : null
      workflowAmbiguousNodes = []
      workflowPickerSelection = ''
      workflowError = null
      profileClipName = (opts.clipName as string) || ''
      profileVaeName = (opts.vaeName as string) || ''
      profileClipType = (opts.clipType as string) || 'lumina2'
      profileWeightDtype = (opts.weightDtype as string) || 'default'
      availableClips = []
      availableVaes = []
      const rawLoras = Array.isArray(opts.loras) ? opts.loras : opts.lora ? [opts.lora] : []
      profileLoras = rawLoras
        .filter((item: unknown) => item && typeof item === 'object')
        .map((item: any) => ({
          id: crypto.randomUUID(),
          name: typeof item.name === 'string' ? item.name : '',
          strengthModel: typeof item.strengthModel === 'number' ? item.strengthModel : 1.0,
          strengthClip: typeof item.strengthClip === 'number' ? item.strengthClip : 1.0,
        }))
        .filter((item: ComfyLoraConfig) => item.name.trim().length > 0)
      selectedLoraName = ''
      selectedEmbeddingName = ''
    }

    showApiKey = false
    showCopyDropdown = false
    openProfileIds.add(profile.id)
  }

  function resetEditState() {
    editingProfileId = null
    isNewProfile = false
    showCopyDropdown = false
  }

  function addSelectedLora() {
    const name = selectedLoraName.trim()
    if (!name) return
    if (profileLoras.some((lora) => lora.name === name)) return
    profileLoras = [
      ...profileLoras,
      { id: crypto.randomUUID(), name, strengthModel: 1.0, strengthClip: 1.0 },
    ]
    selectedLoraName = ''
  }

  function removeLora(id: string) {
    profileLoras = profileLoras.filter((lora) => lora.id !== id)
  }

  function getSmartLoraCatalogForEditingProfile(): SmartLoraCatalogEntry[] {
    const profileId = isNewProfile ? null : editingProfileId
    return settings.serviceSpecificSettings.imageGeneration.smartLoraCatalog.filter(
      (entry) => entry.profileId === profileId,
    )
  }

  async function addToSmartLoraCatalog(loraName: string) {
    if (!loraName.trim()) return
    if (!editingProfileId || isNewProfile) return

    const catalog = settings.serviceSpecificSettings.imageGeneration.smartLoraCatalog
    const exists = catalog.some(
      (entry) => entry.profileId === editingProfileId && entry.loraName === loraName,
    )
    if (exists) return

    settings.serviceSpecificSettings.imageGeneration.smartLoraCatalog = [
      ...catalog,
      {
        id: crypto.randomUUID(),
        profileId: editingProfileId,
        loraName,
        description: '',
        tags: [],
        minAge: null,
        maxAge: null,
        strengthModel: 1,
        strengthClip: 1,
        priority: 0,
        enabled: true,
      },
    ]
    await settings.saveServiceSpecificSettings()
  }

  async function removeFromSmartLoraCatalog(id: string) {
    settings.serviceSpecificSettings.imageGeneration.smartLoraCatalog =
      settings.serviceSpecificSettings.imageGeneration.smartLoraCatalog.filter(
        (entry) => entry.id !== id,
      )
    await settings.saveServiceSpecificSettings()
  }

  function getTagsText(entry: SmartLoraCatalogEntry): string {
    return entry.tags.join(', ')
  }

  async function setTagsText(entry: SmartLoraCatalogEntry, raw: string) {
    entry.tags = raw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    await settings.saveServiceSpecificSettings()
  }

  async function handleSaveProfile() {
    if (!canSaveProfile) return

    await settings.addImageProfile({
      name: profileName.trim(),
      providerType: profileProviderType,
      apiKey: profileApiKey,
      baseUrl: profileBaseUrl || undefined,
      model: profileModel,
      providerOptions: buildProviderOptions(),
    })

    resetEditState()
  }

  async function deleteProfile(id: string) {
    await settings.deleteImageProfile(id)
    if (editingProfileId === id) resetEditState()
  }

  function copyApiKeyFromProfile(apiProfile: APIProfile) {
    profileApiKey = apiProfile.apiKey
    showCopyDropdown = false
  }

  function handleProfileOpenChange(open: boolean, profile: ImageProfile) {
    if (open) {
      startEditProfile(profile)
    } else {
      if (editingProfileId === profile.id) {
        saveEditingProfile()
        resetEditState()
      }
      openProfileIds.delete(profile.id)
    }
  }

  // ---------------------------------------------------------------------------
  // Custom workflow handlers
  // ---------------------------------------------------------------------------

  /**
   * Called after a file is selected or JSON is pasted.
   * Validates the JSON, runs detection, and either auto-confirms or shows the picker.
   */
  function processWorkflowJson(json: unknown, filename: string) {
    workflowError = null
    workflowAmbiguousNodes = []
    workflowPickerSelection = ''

    const validationError = validateApiWorkflow(json)
    if (validationError) {
      workflowError = validationError
      return
    }

    const workflow = json as ComfyCustomWorkflow['workflow']
    const { positiveNodes, negativeNode, seedPath, outputNodeId, saveImageCount } =
      detectWorkflowFields(workflow)

    if (positiveNodes.length === 0) {
      workflowError = 'No CLIPTextEncode (positive) node found in workflow.'
      return
    }
    if (!seedPath) {
      workflowError = 'No KSampler or KSamplerAdvanced node found — cannot detect seed path.'
      return
    }
    if (saveImageCount === 0) {
      workflowError = 'No SaveImage node found in workflow.'
      return
    }
    if (saveImageCount > 1) {
      workflowError = `Workflow has ${saveImageCount} SaveImage nodes. Please keep exactly one SaveImage node.`
      return
    }

    workflowFileName = filename

    if (positiveNodes.length > 1) {
      // Ambiguous — show picker. Store parsed data in pending state; do NOT write
      // profileCustomWorkflow yet so the auto-save effect doesn't fire prematurely.
      pendingWorkflowData = {
        workflow,
        seedPath,
        outputNodeId: outputNodeId!,
        negativePromptPath: negativeNode?.path ?? null,
      }
      workflowAmbiguousNodes = positiveNodes
      workflowPickerSelection = positiveNodes[0].path
    } else {
      // Unambiguous — auto-confirm immediately
      pendingWorkflowData = null
      profileCustomWorkflow = {
        workflow,
        positivePromptPath: positiveNodes[0].path,
        seedPath,
        outputNodeId: outputNodeId!,
        negativePromptPath: negativeNode?.path ?? null,
      }
      workflowAmbiguousNodes = []
    }
  }

  function handleWorkflowFileInput(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)
        processWorkflowJson(json, file.name)
      } catch {
        workflowError = 'Invalid JSON file.'
      }
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-selected after clearing
    input.value = ''
  }

  function confirmWorkflowPicker() {
    if (!pendingWorkflowData || !workflowPickerSelection) return
    profileCustomWorkflow = { ...pendingWorkflowData, positivePromptPath: workflowPickerSelection }
    pendingWorkflowData = null
    workflowAmbiguousNodes = []
  }

  function clearCustomWorkflow() {
    profileCustomWorkflow = null
    pendingWorkflowData = null
    workflowAmbiguousNodes = []
    workflowPickerSelection = ''
    workflowError = null
    workflowFileName = null
  }

  // ---------------------------------------------------------------------------
  // UNet model loading
  // ---------------------------------------------------------------------------

  let unetModelsReqId = 0

  async function loadUnetModels() {
    if (profileProviderType !== 'comfyui') return
    const baseUrl = profileBaseUrl?.trim() || 'http://localhost:8188'
    const reqId = ++unetModelsReqId
    isLoadingUnetModels = true
    try {
      const [clips, vaes] = await Promise.all([
        fetchModelList(baseUrl, 'text_encoders', settings.apiSettings.llmTimeoutMs),
        fetchModelList(baseUrl, 'vae', settings.apiSettings.llmTimeoutMs),
      ])
      if (reqId !== unetModelsReqId) return
      availableClips = clips
      availableVaes = vaes
    } finally {
      if (reqId === unetModelsReqId) isLoadingUnetModels = false
    }
  }

  // Auto-load when switching to UNet mode
  $effect(() => {
    if (profileMode === ComfyMode.UnetTxt2Img && availableClips.length === 0) {
      untrack(() => void loadUnetModels())
    }
  })

  // Evict comfy.ts caches when the user changes the ComfyUI base URL so that
  // the next generate/listModels call fetches fresh model lists.
  // Also clear availableClips/Vaes so the auto-load effect can trigger a fresh fetch.
  $effect(() => {
    if (profileProviderType === 'comfyui') {
      const currentUrl = profileBaseUrl.trim() || 'http://localhost:8188'
      if (prevComfyBaseUrl !== null && prevComfyBaseUrl !== currentUrl) {
        clearComfyCacheForUrl(prevComfyBaseUrl)
        availableClips = []
        availableVaes = []
        availableEmbeddings = []
      }
      prevComfyBaseUrl = currentUrl
    } else {
      if (prevComfyBaseUrl !== null) {
        clearComfyCacheForUrl(prevComfyBaseUrl)
      }
      prevComfyBaseUrl = null
      availableClips = []
      availableVaes = []
      availableEmbeddings = []
    }
  })
</script>

<div class="space-y-4">
  <div class="flex items-center justify-end">
    <Button variant="ghost" size="sm" onclick={() => settings.resetImageGenerationSettings()}>
      <RotateCcw class="mr-1 h-3 w-3" />
      Reset to Defaults
    </Button>
  </div>

  <Tabs.Root value={activeTab} onValueChange={(v) => (activeTab = v as typeof activeTab)}>
    <Tabs.List class="grid w-full {settings.uiSettings.debugMode ? 'grid-cols-5' : 'grid-cols-4'}">
      <Tabs.Trigger value="profiles">Profiles</Tabs.Trigger>
      <Tabs.Trigger value="general">Story Images</Tabs.Trigger>
      <Tabs.Trigger value="characters">Characters</Tabs.Trigger>
      <Tabs.Trigger value="backgrounds">Backgrounds</Tabs.Trigger>
      {#if settings.uiSettings.debugMode}
        <Tabs.Trigger value="testing">Testing</Tabs.Trigger>
      {/if}
    </Tabs.List>

    <div class="mt-4 min-h-[400px]">
      <!-- Profiles Tab -->
      <Tabs.Content value="profiles" class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-muted-foreground text-sm">
            Image profiles configure which provider and API key to use for image generation.
          </p>
          <Button size="sm" onclick={startNewProfile}>
            <Plus class="mr-1 h-3 w-3" />
            Add Profile
          </Button>
        </div>

        <!-- New Profile Form (inline) -->
        {#if isNewProfile && editingProfileId}
          <Card class="border-primary/50 bg-primary/5">
            <CardContent>
              {@render profileForm()}
              {#if needsWorkflow}
                <p class="text-destructive pt-2 text-xs">
                  Upload and confirm a workflow before saving.
                </p>
              {/if}
              <div class="flex gap-2 pt-2">
                <Button variant="outline" onclick={resetEditState} class="flex-1">Cancel</Button>
                <Button onclick={handleSaveProfile} disabled={!canSaveProfile} class="flex-1">
                  <Check class="h-4 w-4" />
                  Create Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        {/if}

        {#if settings.imageProfiles.length === 0 && !isNewProfile}
          <Alert.Root>
            <Info class="h-4 w-4" />
            <Alert.Title>No Image Profiles</Alert.Title>
            <Alert.Description class="text-xs">
              Create an image profile to start generating images. You can have multiple profiles for
              different providers or use cases (e.g., portraits vs backgrounds).
            </Alert.Description>
          </Alert.Root>
        {:else}
          <div class="space-y-3">
            {#each settings.imageProfiles as profile (profile.id)}
              <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
                <Collapsible.Root
                  open={openProfileIds.has(profile.id)}
                  onOpenChange={(open) => handleProfileOpenChange(open, profile)}
                >
                  <div class="flex items-center gap-3 p-3 pl-4">
                    <Collapsible.Trigger
                      class="group/trigger flex flex-1 items-center gap-2 text-left"
                    >
                      <ChevronRight
                        class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90"
                      />
                      <div class="min-w-0 flex-1">
                        <span class="text-sm font-medium">{profile.name}</span>
                        <p class="text-muted-foreground text-xs">
                          {providerTypes.find((p) => p.value === profile.providerType)?.label ||
                            profile.providerType}
                          {profile.model ? ` · ${profile.model}` : ''}
                          {profile.providerType === 'comfyui' || profile.providerType === 'a1111'
                            ? ' · API key not required'
                            : profile.apiKey
                              ? ' · Key configured'
                              : ' · No API key'}
                        </p>
                      </div>
                    </Collapsible.Trigger>
                    <div class="flex shrink-0 items-center gap-1">
                      <IconRow onDelete={() => deleteProfile(profile.id)} size="icon" />
                    </div>
                  </div>

                  <Collapsible.Content>
                    {#if editingProfileId === profile.id}
                      <div class="bg-muted/10 space-y-4 border-t p-4">
                        {@render profileForm()}
                      </div>
                    {/if}
                  </Collapsible.Content>
                </Collapsible.Root>
              </div>
            {/each}
          </div>
        {/if}
      </Tabs.Content>

      <!-- General Tab -->
      <Tabs.Content value="general" class="space-y-6">
        <section class="space-y-6">
          <div class="bg-muted/10 space-y-6 rounded-lg border p-4">
            <div class="space-y-3">
              <Alert.Root>
                <Info class="h-4 w-4" />
                <Alert.Title>Story Image Profile Selection</Alert.Title>
                <Alert.Description class="text-xs">
                  <ul class="mt-2 list-inside list-disc space-y-1">
                    <li>
                      <strong>Reference Profile</strong>: Used when "Portrait Mode" is enabled in
                      your current story. Generates images based on the character portraits.
                    </li>
                    <li>
                      <strong>Regular Image Profile</strong>: Used when "Portrait Mode" is disabled
                      in your current story.
                    </li>
                  </ul>
                  <p class="mt-2">Models are configured in each profile on the Profiles tab.</p>
                </Alert.Description>
              </Alert.Root>
            </div>

            <div class="grid gap-6 md:grid-cols-2">
              <!-- Standard Image Configuration -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label>Regular Image Profile</Label>
                  <Autocomplete
                    items={settings.imageProfiles}
                    selected={getSelectedImageProfile('standard')}
                    onSelect={(v) => onProfileChange((v as ImageProfile).id, 'standard')}
                    itemLabel={(p: ImageProfile) =>
                      `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
                    itemValue={(p: ImageProfile) => p.id}
                    placeholder="Select an image profile"
                  />
                </div>

                {#if settings.systemServicesSettings.imageGeneration.profileId}
                  <div class="space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <Label>Regular Image Size</Label>
                      {#if standardFamilyInfo}
                        <span
                          class="text-muted-foreground bg-muted rounded px-2 py-0.5 text-[11px]"
                        >
                          {standardFamilyInfo.source === 'override' ? 'Overridden' : 'Auto'}: {getFamilyLabel(
                            standardFamilyInfo.family,
                          )}
                        </span>
                      {/if}
                    </div>
                    <Autocomplete
                      items={standardSizes}
                      selected={standardSizes.find(
                        (s) => s.value === settings.systemServicesSettings.imageGeneration.size,
                      ) ||
                        (settings.systemServicesSettings.imageGeneration.size
                          ? {
                              value: settings.systemServicesSettings.imageGeneration.size,
                              label: settings.systemServicesSettings.imageGeneration.size,
                            }
                          : undefined)}
                      onSelect={(v) => {
                        settings.systemServicesSettings.imageGeneration.size = (
                          v as { value: string }
                        ).value
                        settings.saveSystemServicesSettings()
                      }}
                      allowCustom={true}
                      onCustomSelect={(v) => {
                        settings.systemServicesSettings.imageGeneration.size = v
                        settings.saveSystemServicesSettings()
                      }}
                      itemLabel={(s: { label: string }) => s.label}
                      itemValue={(s: { value: string }) => s.value}
                      placeholder="Select size"
                    />
                  </div>
                {/if}
              </div>

              <!-- Reference Image Configuration -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label>Reference (Img2Img) Profile</Label>
                  <Autocomplete
                    items={settings.imageProfiles}
                    selected={getSelectedImageProfile('reference')}
                    onSelect={(v) => onProfileChange((v as ImageProfile).id, 'reference')}
                    itemLabel={(p: ImageProfile) =>
                      `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
                    itemValue={(p: ImageProfile) => p.id}
                    placeholder="Select an image profile"
                  />
                </div>

                {#if settings.systemServicesSettings.imageGeneration.referenceProfileId || settings.systemServicesSettings.imageGeneration.profileId}
                  <div class="space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <Label>Reference Image Size</Label>
                      {#if referenceFamilyInfo}
                        <span
                          class="text-muted-foreground bg-muted rounded px-2 py-0.5 text-[11px]"
                        >
                          {referenceFamilyInfo.source === 'override' ? 'Overridden' : 'Auto'}: {getFamilyLabel(
                            referenceFamilyInfo.family,
                          )}
                        </span>
                      {/if}
                    </div>
                    <Autocomplete
                      items={referenceSizes}
                      selected={referenceSizes.find(
                        (s) =>
                          s.value === settings.systemServicesSettings.imageGeneration.referenceSize,
                      ) ||
                        (settings.systemServicesSettings.imageGeneration.referenceSize
                          ? {
                              value: settings.systemServicesSettings.imageGeneration.referenceSize,
                              label: settings.systemServicesSettings.imageGeneration.referenceSize,
                            }
                          : undefined)}
                      onSelect={(v) => {
                        settings.systemServicesSettings.imageGeneration.referenceSize = (
                          v as { value: string }
                        ).value
                        settings.saveSystemServicesSettings()
                      }}
                      allowCustom={true}
                      onCustomSelect={(v) => {
                        settings.systemServicesSettings.imageGeneration.referenceSize = v
                        settings.saveSystemServicesSettings()
                      }}
                      itemLabel={(s: { label: string }) => s.label}
                      itemValue={(s: { value: string }) => s.value}
                      placeholder="Select size"
                    />
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Image Style -->
          <div class="space-y-2">
            <Label>Story Image Style</Label>
            <Autocomplete
              items={imageStyles}
              selected={imageStyles.find(
                (s) => s.value === settings.systemServicesSettings.imageGeneration.styleId,
              )}
              onSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.styleId = (
                  v as { value: string }
                ).value
                settings.saveSystemServicesSettings()
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select style"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Visual style for generated story images. Edit styles in the Prompts tab.
            </p>
          </div>

          <!-- Max Images Per Message -->
          <div class="space-y-2">
            <Label>
              Max Images Per Message: {settings.systemServicesSettings.imageGeneration
                .maxImagesPerMessage === 0
                ? 'Unlimited'
                : settings.systemServicesSettings.imageGeneration.maxImagesPerMessage}
            </Label>
            <Slider
              type="multiple"
              value={[settings.systemServicesSettings.imageGeneration.maxImagesPerMessage]}
              onValueChange={(v) => {
                settings.systemServicesSettings.imageGeneration.maxImagesPerMessage = v[0]
                settings.saveSystemServicesSettings()
              }}
              min={0}
              max={5}
              step={1}
            />
          </div>
        </section>
      </Tabs.Content>

      <!-- Characters Tab -->
      <Tabs.Content value="characters" class="space-y-6">
        <section class="space-y-4">
          <div class="space-y-2">
            <Label>Character Portrait Profile</Label>
            <Autocomplete
              items={settings.imageProfiles}
              selected={getSelectedImageProfile('portrait')}
              onSelect={(v) => onProfileChange((v as ImageProfile).id, 'portrait')}
              itemLabel={(p: ImageProfile) =>
                `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
              itemValue={(p: ImageProfile) => p.id}
              placeholder="Select an image profile"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Profile used for generating character portraits. Model is configured in the profile.
            </p>
          </div>

          {#if settings.systemServicesSettings.imageGeneration.portraitProfileId || settings.systemServicesSettings.imageGeneration.profileId}
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <Label>Character Portrait Size</Label>
                {#if portraitFamilyInfo}
                  <span class="text-muted-foreground bg-muted rounded px-2 py-0.5 text-[11px]">
                    {portraitFamilyInfo.source === 'override' ? 'Overridden' : 'Auto'}: {getFamilyLabel(
                      portraitFamilyInfo.family,
                    )}
                  </span>
                {/if}
              </div>
              <Autocomplete
                items={portraitSizes}
                selected={portraitSizes.find(
                  (s) => s.value === settings.systemServicesSettings.imageGeneration.portraitSize,
                ) ||
                  (settings.systemServicesSettings.imageGeneration.portraitSize
                    ? {
                        value: settings.systemServicesSettings.imageGeneration.portraitSize,
                        label: settings.systemServicesSettings.imageGeneration.portraitSize,
                      }
                    : undefined)}
                onSelect={(v) => {
                  settings.systemServicesSettings.imageGeneration.portraitSize = (
                    v as { value: string }
                  ).value
                  settings.saveSystemServicesSettings()
                }}
                allowCustom={true}
                onCustomSelect={(v) => {
                  settings.systemServicesSettings.imageGeneration.portraitSize = v
                  settings.saveSystemServicesSettings()
                }}
                itemLabel={(s: { label: string }) => s.label}
                itemValue={(s: { value: string }) => s.value}
                placeholder="Select size"
              />
            </div>
          {/if}

          <div class="space-y-2">
            <Label>Character Portrait Style</Label>
            <Autocomplete
              items={imageStyles}
              selected={imageStyles.find(
                (s) => s.value === settings.systemServicesSettings.imageGeneration.portraitStyleId,
              )}
              onSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.portraitStyleId = (
                  v as { value: string }
                ).value
                settings.saveSystemServicesSettings()
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select style"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Visual style for character portraits. Edit styles in the Prompts tab.
            </p>
          </div>
        </section>
      </Tabs.Content>

      <!-- Backgrounds Tab -->
      <Tabs.Content value="backgrounds" class="space-y-6">
        <section class="space-y-4">
          <div class="space-y-2">
            <Label>Background Profile</Label>
            <Autocomplete
              items={settings.imageProfiles}
              selected={getSelectedImageProfile('background')}
              onSelect={(v) => onProfileChange((v as ImageProfile).id, 'background')}
              itemLabel={(p: ImageProfile) =>
                `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
              itemValue={(p: ImageProfile) => p.id}
              placeholder="Select an image profile"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Profile used for generating background scenes. Model is configured in the profile.
            </p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <Label>Background Size</Label>
              {#if backgroundFamilyInfo}
                <span class="text-muted-foreground bg-muted rounded px-2 py-0.5 text-[11px]">
                  {backgroundFamilyInfo.source === 'override' ? 'Overridden' : 'Auto'}: {getFamilyLabel(
                    backgroundFamilyInfo.family,
                  )}
                </span>
              {/if}
            </div>
            <Autocomplete
              items={bgSupportedSizes}
              selected={bgSupportedSizes.find(
                (s) => s.value === settings.systemServicesSettings.imageGeneration.backgroundSize,
              ) ||
                (settings.systemServicesSettings.imageGeneration.backgroundSize
                  ? {
                      value: settings.systemServicesSettings.imageGeneration.backgroundSize,
                      label: settings.systemServicesSettings.imageGeneration.backgroundSize,
                    }
                  : undefined)}
              onSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.backgroundSize = (
                  v as { value: string }
                ).value
                settings.saveSystemServicesSettings()
              }}
              allowCustom={true}
              onCustomSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.backgroundSize = v
                settings.saveSystemServicesSettings()
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select size"
            />
          </div>

          <div class="space-y-2">
            <Label>
              Background Blur: {settings.systemServicesSettings.imageGeneration.backgroundBlur}px
            </Label>
            <Slider
              type="multiple"
              value={[settings.systemServicesSettings.imageGeneration.backgroundBlur]}
              onValueChange={(v: number[]) => {
                settings.systemServicesSettings.imageGeneration.backgroundBlur = v[0]
                settings.saveSystemServicesSettings()
              }}
              min={0}
              max={20}
              step={1}
            />
            <p class="text-muted-foreground mt-1 text-xs">Blur amount for the background image.</p>
          </div>
        </section>
      </Tabs.Content>

      {#if settings.uiSettings.debugMode}
        <Tabs.Content value="testing" class="space-y-6">
          <section class="space-y-4">
            <div class="space-y-2">
              <Label>Test Profile</Label>
              <Autocomplete
                items={settings.imageProfiles}
                selected={settings.imageProfiles.find((p) => p.id === testProfileId)}
                onSelect={(v) => (testProfileId = (v as ImageProfile).id)}
                itemLabel={(p: ImageProfile) =>
                  `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
                itemValue={(p: ImageProfile) => p.id}
                placeholder="Select a profile to test"
              />
            </div>

            <div class="space-y-2">
              <Label>Prompt</Label>
              <Textarea bind:value={testPrompt} placeholder="Enter a test prompt..." rows={4} />
            </div>

            <div class="space-y-2">
              <Label>Size</Label>
              <Autocomplete
                items={testingSizes}
                selected={testingSizes.find((s) => s.value === testSize) || {
                  value: testSize,
                  label: testSize,
                }}
                onSelect={(v) => (testSize = (v as { value: string }).value)}
                allowCustom={true}
                onCustomSelect={(v) => (testSize = v)}
                itemLabel={(s: { label: string }) => s.label}
                itemValue={(s: { value: string }) => s.value}
                placeholder="Select size"
              />
            </div>

            <Button
              onclick={handleTestGenerate}
              disabled={isGeneratingTestImage || !testProfileId || !testPrompt.trim()}
              class="w-full"
            >
              {#if isGeneratingTestImage}
                <RotateCcw class="mr-2 h-4 w-4 animate-spin" />
                Generating...
              {:else}
                Generate Test Image
              {/if}
            </Button>

            {#if testError}
              <Alert.Root variant="destructive">
                <Alert.Title>Generation Error</Alert.Title>
                <Alert.Description>{testError}</Alert.Description>
              </Alert.Root>
            {/if}

            {#if testImageResult}
              <div class="mt-4 space-y-2">
                <Label>Result Image</Label>
                <div class="overflow-hidden rounded-lg border bg-black/5">
                  <img
                    src="data:image/png;base64,{testImageResult}"
                    alt="Generated test"
                    class="mx-auto block h-auto max-w-full"
                  />
                </div>
              </div>
            {/if}
          </section>
        </Tabs.Content>
      {/if}
    </div>
  </Tabs.Root>
</div>

{#snippet profileForm()}
  <div class="space-y-4">
    <div class="space-y-2">
      <Label>Name</Label>
      <Input bind:value={profileName} placeholder="e.g., NanoGPT Images" />
    </div>

    <div class="space-y-2">
      <Label>Provider</Label>
      <Autocomplete
        items={providerTypes}
        selected={providerTypes.find((p) => p.value === profileProviderType)}
        onSelect={(v) => {
          profileProviderType = (v as { value: ImageProviderType }).value
        }}
        itemLabel={(p: { label: string }) => p.label}
        itemValue={(p: { value: string }) => p.value}
        placeholder="Select provider"
      />
    </div>

    <!-- comfy and a1111 don't require API keys -->
    {#if profileProviderType !== 'comfyui' && profileProviderType !== 'a1111'}
      <div class="space-y-2">
        <Label>API Key</Label>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Input
              type={showApiKey ? 'text' : 'password'}
              bind:value={profileApiKey}
              placeholder="Enter API key"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center pr-3"
              onclick={() => (showApiKey = !showApiKey)}
            >
              {#if showApiKey}
                <EyeOff class="text-muted-foreground h-4 w-4" />
              {:else}
                <Eye class="text-muted-foreground h-4 w-4" />
              {/if}
            </button>
          </div>
        </div>

        {#if settings.apiSettings.profiles.length > 0}
          <div class="relative">
            <Button
              variant="outline"
              size="sm"
              onclick={() => (showCopyDropdown = !showCopyDropdown)}
            >
              <Copy class="mr-1 h-3 w-3" />
              Copy from API Profile
            </Button>
            {#if showCopyDropdown}
              <div class="bg-popover absolute z-10 mt-1 w-64 rounded-md border shadow-md">
                {#each settings.apiSettings.profiles as apiProfile (apiProfile.id)}
                  <button
                    type="button"
                    class="hover:bg-accent w-full px-3 py-2 text-left text-sm"
                    onclick={() => copyApiKeyFromProfile(apiProfile)}
                  >
                    {apiProfile.name}
                    <span class="text-muted-foreground text-xs">({apiProfile.providerType})</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if profileProviderType === 'comfyui' || profileProviderType === 'openai' || profileProviderType === 'zhipu' || profileProviderType === 'a1111'}
      <div class="space-y-2">
        <Label>Base URL (optional)</Label>
        <Input bind:value={profileBaseUrl} placeholder="Custom base URL" />
      </div>
    {/if}

    {#snippet modelSelectContent()}
      <Label>Model</Label>
      <ImageModelSelect
        models={profileModels}
        selectedModelId={profileModel}
        onModelChange={(id) => {
          profileModel = id
        }}
        filterFunc={undefined}
        showCost={true}
        showImg2ImgIndicator={true}
        showDescription={profileProviderType === 'comfyui'}
        isLoading={isLoadingProfileModels}
        errorMessage={profileModelsError}
        showRefreshButton={true}
        onRefresh={() =>
          loadProfileFormModels(profileProviderType, profileApiKey, profileBaseUrl, true)}
      />
      {#if referenceProfileImg2ImgWarning}
        <p class="text-warning mt-1 text-xs">
          This profile is used for reference image generation (img2img), but the selected model does
          not support img2img.
        </p>
      {:else}
        <p class="text-muted-foreground mt-1 text-xs">
          The image model this profile will use for generation.
        </p>
      {/if}

      <div class="mt-3 space-y-2">
        <Label>Base Model Family Override</Label>
        <Autocomplete
          items={baseModelFamilyItems}
          selected={baseModelFamilyItems.find((i) => i.value === profileBaseModelFamilyOverride)}
          onSelect={(v) => {
            profileBaseModelFamilyOverride = (v as { value: BaseModelFamily }).value
          }}
          itemLabel={(s: { label: string }) => s.label}
          itemValue={(s: { value: string }) => s.value}
          placeholder="Auto-detect from selected model"
        />
        <p class="text-muted-foreground mt-1 text-xs">
          Optional override used for model-specific size presets (SD1.5, SD Turbo, SDXL, Pony, IL,
          Flux).
        </p>
      </div>
    {/snippet}

    {#if profileProviderType !== 'comfyui' && profileProviderType !== 'a1111'}
      <div class="space-y-2">
        {@render modelSelectContent()}
      </div>
    {/if}
    {#if profileProviderType === 'a1111'}
      <div class="space-y-2">
        {@render modelSelectContent()}
      </div>
      <div class="grid grid-cols-2 gap-4 pt-2">
        <div class="space-y-2">
          <Label>Steps</Label>
          <Input type="number" bind:value={profileSteps} placeholder="20" min="1" />
        </div>
        <div class="space-y-2">
          <Label>CFG Scale</Label>
          <Input type="number" bind:value={profileCfg} placeholder="7" step="0.5" />
        </div>
        <div class="space-y-2">
          <Label>Sampler</Label>
          <Autocomplete
            items={profileSamplers}
            selected={profileSamplers.find((s) => s.value === profileSampler)}
            onSelect={(v) => {
              profileSampler = (v as { value: string }).value
            }}
            itemLabel={(s: { label: string }) => s.label}
            itemValue={(s: { value: string }) => s.value}
            placeholder="Euler a"
          />
        </div>
        <div class="space-y-2">
          <Label>Scheduler</Label>
          <Autocomplete
            items={profileSchedulers}
            selected={profileSchedulers.find((s) => s.value === profileScheduler)}
            onSelect={(v) => {
              profileScheduler = (v as { value: string }).value
            }}
            itemLabel={(s: { label: string }) => s.label}
            itemValue={(s: { value: string }) => s.value}
            placeholder="karras"
          />
        </div>
        <div class="col-span-2 space-y-2">
          <Label>Negative Prompt</Label>
          <Textarea bind:value={profileNegativePrompt} placeholder="Negative prompt..." />
        </div>
      </div>
    {/if}
    {#if profileProviderType === 'comfyui'}
      <div class="grid grid-cols-2 gap-4 pt-2">
        <div class="col-span-2 space-y-2">
          <Label>Mode</Label>
          <Autocomplete
            items={profileModes}
            selected={profileModes.find((s) => s.value === profileMode)}
            onSelect={(v) => {
              profileMode = (v as { value: string }).value
            }}
            itemLabel={(s: { label: string }) => s.label}
            itemValue={(s: { value: string }) => s.value}
            placeholder="Select mode"
          />
        </div>
        {#if profileMode !== ComfyMode.CustomWorkflow}
          <div class="col-span-2 space-y-2">
            {@render modelSelectContent()}
          </div>
          <div class="space-y-2">
            <Label>Sampler</Label>
            <Autocomplete
              items={profileSamplers}
              selected={profileSamplers.find((s) => s.value === profileSampler)}
              onSelect={(v) => {
                profileSampler = (v as { value: string }).value
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select sampler"
            />
          </div>
          <div class="space-y-2">
            <Label>Scheduler</Label>
            <Autocomplete
              items={profileSchedulers}
              selected={profileSchedulers.find((s) => s.value === profileScheduler)}
              onSelect={(v) => {
                profileScheduler = (v as { value: string }).value
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select scheduler"
            />
          </div>
          <div class="space-y-2">
            <Label>CFG</Label>
            <Input type="number" bind:value={profileCfg} placeholder="Enter CFG" step="0.1" />
          </div>
          <div class="space-y-2">
            <Label>Steps</Label>
            <Input type="number" bind:value={profileSteps} placeholder="Enter Steps" />
          </div>
        {/if}
        <div class="col-span-2 space-y-2">
          <Label>Positive Prompt Base</Label>
          <Textarea bind:value={profilePositivePrompt} placeholder="Base positive prompt..." />
        </div>
        {#if (profileMode !== ComfyMode.CustomWorkflow && profileMode !== ComfyMode.UnetTxt2Img) || profileCustomWorkflow?.negativePromptPath}
          <div class="col-span-2 space-y-2">
            <Label>Negative Prompt</Label>
            <Textarea bind:value={profileNegativePrompt} placeholder="Negative prompt..." />

            <div class="space-y-2 rounded-md border p-2.5">
              <div class="flex items-center justify-between">
                <Label>Embeddings (Comfy)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onclick={() => loadEmbeddings(profileBaseUrl || undefined)}
                >
                  ↻ Refresh
                </Button>
              </div>
              <div class="flex gap-2">
                <div class="flex-1">
                  <Autocomplete
                    items={embeddingItems}
                    selected={availableEmbeddings.includes(selectedEmbeddingName)
                      ? { value: selectedEmbeddingName, label: selectedEmbeddingName }
                      : undefined}
                    onSelect={(v) => {
                      selectedEmbeddingName = (v as { value: string }).value
                    }}
                    itemLabel={(s: { label: string }) => s.label}
                    itemValue={(s: { value: string }) => s.value}
                    placeholder="Select embedding..."
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onclick={addSelectedEmbeddingToNegativePrompt}
                  disabled={!selectedEmbeddingName.trim()}
                >
                  <Plus class="h-4 w-4" />
                </Button>
              </div>
              <p class="text-muted-foreground text-xs">
                Inserts the selected embedding token into the negative prompt.
              </p>
            </div>
          </div>
        {/if}

        {#if profileMode === ComfyMode.CustomWorkflow}
          <div class="col-span-2 space-y-3 border-t pt-3">
            <div class="flex items-center justify-between">
              <Label>Custom Workflow (API format)</Label>
              {#if profileCustomWorkflow}
                <button
                  type="button"
                  class="text-muted-foreground hover:text-destructive text-xs underline"
                  onclick={clearCustomWorkflow}
                >
                  Clear
                </button>
              {/if}
            </div>

            {#if profileCustomWorkflow && workflowAmbiguousNodes.length === 0}
              <!-- State B: workflow loaded and confirmed -->
              <div class="bg-muted/40 space-y-1 rounded-md border px-3 py-2 text-xs">
                <p class="text-foreground font-medium">
                  ✓ {workflowFileName ?? 'Workflow loaded'} ({Object.keys(
                    profileCustomWorkflow.workflow,
                  ).length} nodes)
                </p>
                <p class="text-muted-foreground">
                  Prompt → <code class="text-xs">{profileCustomWorkflow.positivePromptPath}</code>
                </p>
                <p class="text-muted-foreground">
                  Seed → <code class="text-xs">{profileCustomWorkflow.seedPath}</code>
                </p>
                {#if profileCustomWorkflow.negativePromptPath}
                  <p class="text-muted-foreground">
                    Negative → <code class="text-xs"
                      >{profileCustomWorkflow.negativePromptPath}</code
                    >
                  </p>
                {:else}
                  <p class="text-muted-foreground italic">
                    No negative prompt node detected (ignored).
                  </p>
                {/if}
              </div>
            {:else if workflowAmbiguousNodes.length > 0}
              <!-- Picker: multiple CLIPTextEncode positive nodes found -->
              <div class="bg-muted/40 space-y-2 rounded-md border px-3 py-2">
                <p class="text-muted-foreground text-xs">
                  Multiple prompt nodes found. Select the one to use as the positive prompt:
                </p>
                {#each workflowAmbiguousNodes as node (node.nodeId)}
                  <label
                    class="hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 rounded p-1.5 text-xs transition-colors"
                  >
                    <input
                      type="radio"
                      name="workflow-positive-node"
                      value={node.path}
                      bind:group={workflowPickerSelection}
                      class="mt-0.5 shrink-0"
                    />
                    <span class="flex flex-col gap-0.5">
                      <span class="font-mono text-[11px]"
                        >{node.nodeId}{#if node.title}
                          <span class="text-muted-foreground font-sans">— {node.title}</span>{/if}
                        {#if node.kSamplerSlot}
                          <span
                            class="bg-primary/10 text-primary ml-1 rounded px-1 py-0.5 font-sans text-[10px] not-italic"
                            >{node.kSamplerSlot}</span
                          >
                        {/if}
                      </span>
                      <span class="text-muted-foreground italic">{node.textPreview}</span>
                    </span>
                  </label>
                {/each}
                <Button size="sm" class="w-full" onclick={confirmWorkflowPicker}
                  >Confirm selection</Button
                >
              </div>
            {:else}
              <!-- State A: no workflow loaded -->
              <details class="group text-xs">
                <summary
                  class="text-muted-foreground hover:text-foreground mb-2 cursor-pointer list-none select-none"
                >
                  <span class="underline underline-offset-2">How to get the workflow file ›</span>
                </summary>
                <ol class="text-muted-foreground mt-1 space-y-1.5 pl-1">
                  <li>
                    <span class="text-foreground font-medium"
                      >1. Start ComfyUI with CORS enabled:</span
                    >
                    <br />
                    <code class="bg-muted mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px]">
                      python main.py --enable-cors-header
                    </code>
                  </li>
                  <li>
                    <span class="text-foreground font-medium">2. Enable Dev Mode in ComfyUI:</span>
                    <br />
                    Open the ComfyUI web UI → click the
                    <strong>gear icon (⚙)</strong> → enable
                    <strong>Dev Mode</strong>. A new
                    <em>"Save (API Format)"</em> button will appear in the toolbar.
                  </li>
                  <li>
                    <span class="text-foreground font-medium">3. Export your workflow:</span>
                    <br />
                    Build or load your workflow, then click
                    <strong>Save (API Format)</strong>. This saves a
                    <code class="text-[11px]">.json</code> file that this app can read.
                  </li>
                  <li>
                    <span class="text-foreground font-medium">4. Upload it below.</span>
                    <br />
                    The app will automatically detect your prompt and seed nodes. If multiple prompt nodes
                    are found, you will be asked to pick one.
                  </li>
                </ol>
              </details>
              <label
                class="border-input hover:border-primary flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm transition-colors"
              >
                <input
                  type="file"
                  accept=".json,application/json"
                  class="hidden"
                  onchange={handleWorkflowFileInput}
                />
                <span class="text-muted-foreground">Upload workflow JSON (API format)</span>
              </label>
            {/if}

            {#if workflowError}
              <p class="text-destructive text-xs">{workflowError}</p>
            {/if}
          </div>
        {/if}
      </div>
      {#if profileMode === ComfyMode.LoraTxt2Img || profileMode === ComfyMode.BasicTxt2Img}
        <div class="grid grid-cols-2 gap-4 pt-2">
          <div class="col-span-2 space-y-2">
            <div class="flex items-center justify-between">
              <Label>LoRA Stack (Optional)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => loadLoras(profileBaseUrl || undefined)}
              >
                ↻ Refresh
              </Button>
            </div>
            <div class="flex gap-2">
              <div class="flex-1">
                <Autocomplete
                  items={loraItems}
                  selected={availableLoras.includes(selectedLoraName)
                    ? { value: selectedLoraName, label: selectedLoraName }
                    : undefined}
                  onSelect={(v) => {
                    selectedLoraName = (v as { value: string }).value
                  }}
                  itemLabel={(s: { label: string }) => s.label}
                  itemValue={(s: { value: string }) => s.value}
                  placeholder="Select LoRA..."
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onclick={addSelectedLora}
                disabled={!selectedLoraName.trim()}
              >
                <Plus class="h-4 w-4" />
              </Button>
            </div>
            <p class="text-muted-foreground text-xs">
              Add one or more LoRAs. They are applied in list order during generation.
            </p>
            {#if availableLoras.length === 0}
              <p class="text-muted-foreground text-xs italic">
                No LoRAs discovered yet. Confirm your ComfyUI base URL and that LoRAs are installed,
                then click Refresh.
              </p>
            {/if}
            {#if editingProfileId && !isNewProfile && selectedLoraName.trim()}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onclick={() => addToSmartLoraCatalog(selectedLoraName.trim())}
                class="w-fit"
              >
                Add To Smart Catalog
              </Button>
            {/if}
          </div>

          {#if profileLoras.length > 0}
            <div class="col-span-2 space-y-2">
              {#each profileLoras as lora (lora.id)}
                <div class="bg-muted/40 rounded-md border p-3">
                  <div class="mb-2 flex items-center justify-between">
                    <p class="text-sm font-medium">{lora.name}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onclick={() => removeLora(lora.id)}
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-1.5">
                      <Label>Model Strength</Label>
                      <Input type="number" bind:value={lora.strengthModel} step="0.05" />
                    </div>
                    <div class="space-y-1.5">
                      <Label>CLIP Strength</Label>
                      <Input type="number" bind:value={lora.strengthClip} step="0.05" />
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <div class="col-span-2 mt-2 space-y-2 rounded-md border p-3">
            <div class="flex items-center justify-between">
              <Label>Smart LoRA Catalog (Labs)</Label>
              <span class="text-muted-foreground text-xs">
                {settings.experimentalFeatures.smartLoraRouting
                  ? 'Enabled in Labs'
                  : 'Disabled in Labs'}
              </span>
            </div>
            <p class="text-muted-foreground text-xs">
              Configure what each LoRA does and optional age rules for automatic Vault Assistant
              routing.
            </p>

            <div class="space-y-1.5">
              <Label>Max Auto-Applied LoRAs</Label>
              <Input
                type="number"
                min="1"
                max="8"
                value={settings.serviceSpecificSettings.imageGeneration.maxAutoLoras}
                oninput={(e) => {
                  const raw = (e.currentTarget as HTMLInputElement).value.trim()
                  const parsed = Number(raw)
                  settings.serviceSpecificSettings.imageGeneration.maxAutoLoras =
                    Number.isFinite(parsed) && parsed > 0 ? Math.min(8, parsed) : 3
                }}
                onblur={() => settings.saveServiceSpecificSettings()}
              />
            </div>

            {#if !editingProfileId || isNewProfile}
              <p class="text-muted-foreground text-xs italic">
                Save this profile first to attach smart LoRA rules to it.
              </p>
            {:else}
              {@const smartCatalog = getSmartLoraCatalogForEditingProfile()}
              {#if smartCatalog.length === 0}
                <p class="text-muted-foreground text-xs italic">
                  No smart rules yet. Add a LoRA above, then click "Add To Smart Catalog".
                </p>
              {:else}
                {#each smartCatalog as entry (entry.id)}
                  <div class="bg-muted/40 space-y-2 rounded-md border p-3">
                    <div class="flex items-center justify-between">
                      <p class="text-sm font-medium">{entry.loraName}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onclick={() => removeFromSmartLoraCatalog(entry.id)}
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>

                    <div class="space-y-1.5">
                      <Label>Description (what this LoRA does)</Label>
                      <Textarea
                        bind:value={entry.description}
                        rows={2}
                        placeholder="e.g. Adjusts character to teenage/young-adult appearance"
                        onblur={() => settings.saveServiceSpecificSettings()}
                      />
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <div class="space-y-1.5">
                        <Label>Min Age (optional)</Label>
                        <Input
                          type="number"
                          value={entry.minAge ?? ''}
                          oninput={(e) => {
                            const raw = (e.currentTarget as HTMLInputElement).value.trim()
                            if (!raw) {
                              entry.minAge = null
                              return
                            }
                            const v = Number(raw)
                            entry.minAge = Number.isFinite(v) ? v : null
                          }}
                          onblur={() => settings.saveServiceSpecificSettings()}
                        />
                      </div>
                      <div class="space-y-1.5">
                        <Label>Max Age (optional)</Label>
                        <Input
                          type="number"
                          value={entry.maxAge ?? ''}
                          oninput={(e) => {
                            const raw = (e.currentTarget as HTMLInputElement).value.trim()
                            if (!raw) {
                              entry.maxAge = null
                              return
                            }
                            const v = Number(raw)
                            entry.maxAge = Number.isFinite(v) ? v : null
                          }}
                          onblur={() => settings.saveServiceSpecificSettings()}
                        />
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <div class="space-y-1.5">
                        <Label>Default Model Strength</Label>
                        <Input
                          type="number"
                          bind:value={entry.strengthModel}
                          step="0.05"
                          onblur={() => settings.saveServiceSpecificSettings()}
                        />
                      </div>
                      <div class="space-y-1.5">
                        <Label>Default CLIP Strength</Label>
                        <Input
                          type="number"
                          bind:value={entry.strengthClip}
                          step="0.05"
                          onblur={() => settings.saveServiceSpecificSettings()}
                        />
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <div class="space-y-1.5">
                        <Label>Tags (comma-separated)</Label>
                        <Input
                          value={getTagsText(entry)}
                          placeholder="teen, young adult, school"
                          onblur={(e) =>
                            setTagsText(entry, (e.currentTarget as HTMLInputElement).value)}
                        />
                      </div>
                      <div class="space-y-1.5">
                        <Label>Priority</Label>
                        <Input
                          type="number"
                          bind:value={entry.priority}
                          step="1"
                          onblur={() => settings.saveServiceSpecificSettings()}
                        />
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <Switch
                        checked={entry.enabled}
                        onCheckedChange={async (checked) => {
                          entry.enabled = checked
                          await settings.saveServiceSpecificSettings()
                        }}
                      />
                      <Label>Enabled</Label>
                    </div>
                  </div>
                {/each}
              {/if}
            {/if}
          </div>
        </div>
      {/if}
      {#if profileMode === ComfyMode.UnetTxt2Img}
        <div class="grid grid-cols-2 gap-4 pt-2">
          <div class="col-span-2 space-y-2">
            <div class="flex items-center justify-between">
              <Label>CLIP / Text Encoder</Label>
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground text-xs underline"
                disabled={isLoadingUnetModels}
                onclick={loadUnetModels}
              >
                {isLoadingUnetModels ? 'Loading…' : '↻ Refresh'}
              </button>
            </div>
            <Autocomplete
              items={clipItems}
              selected={availableClips.includes(profileClipName)
                ? { value: profileClipName, label: profileClipName }
                : profileClipName
                  ? { value: profileClipName, label: profileClipName }
                  : undefined}
              onSelect={(v) => {
                profileClipName = (v as { value: string }).value
              }}
              allowCustom={true}
              onCustomSelect={(v) => {
                profileClipName = v
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Auto-detect first available"
            />
            <p class="text-muted-foreground text-xs">
              Leave empty to auto-detect the first text encoder found in ComfyUI.
            </p>
          </div>

          <div class="col-span-2 space-y-2">
            <Label>VAE</Label>
            <Autocomplete
              items={vaeItems}
              selected={availableVaes.includes(profileVaeName)
                ? { value: profileVaeName, label: profileVaeName }
                : profileVaeName
                  ? { value: profileVaeName, label: profileVaeName }
                  : undefined}
              onSelect={(v) => {
                profileVaeName = (v as { value: string }).value
              }}
              allowCustom={true}
              onCustomSelect={(v) => {
                profileVaeName = v
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Auto-detect first available"
            />
            <p class="text-muted-foreground text-xs">
              Leave empty to auto-detect the first VAE found in ComfyUI.
            </p>
          </div>

          <div class="space-y-2">
            <Label>CLIP Type</Label>
            <Autocomplete
              items={clipTypeItems}
              selected={clipTypeItems.find((s) => s.value === profileClipType)}
              onSelect={(v) => {
                profileClipType = (v as { value: string }).value
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select CLIP type"
            />
          </div>

          <div class="space-y-2">
            <Label>Weight Dtype</Label>
            <Autocomplete
              items={weightDtypeItems}
              selected={weightDtypeItems.find((s) => s.value === profileWeightDtype)}
              onSelect={(v) => {
                profileWeightDtype = (v as { value: string }).value
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select dtype"
            />
          </div>
        </div>
      {/if}
    {/if}
  </div>
{/snippet}
