import Database from '@tauri-apps/plugin-sql'
import type {
  Story,
  StoryFolder,
  StoryEntry,
  Character,
  Location,
  Item,
  StoryBeat,
  Chapter,
  ChapterSource,
  Checkpoint,
  Branch,
  Entry,
  EntryType,
  EntryPreview,
  PersistentRetryState,
  PersistentStyleReviewState,
  TimeTracker,
  EmbeddedImage,
  EmbeddedImageStatus,
  VaultCharacter,
  VaultLorebook,
  VaultScenario,
  VaultTag,
  VaultType,
  VaultConversation,
  EditorConversation,
  VisualDescriptors,
  WorldStateSnapshot,
  EpistemicSecretAtom,
  EpistemicCharacterKnowledgeEdge,
  DirectorProposalArtifact,
  EpistemicCharacterRefType,
  EpistemicIdentityRef,
  Campaign,
  CampaignSettings,
  CampaignPartyMember,
  ActorControlProfile,
  CampaignSession,
  CampaignThread,
  CampaignThreadBeat,
  SceneTurnState,
  SessionPartyMember,
  Ruleset,
  RulesetStat,
  RulesetSkill,
  RulesetCheckRule,
  RulesetCondition,
  RulesetSlot,
  RulesetAbility,
  RulesetSpell,
  RulesetCreature,
  RulesetLevel,
  RulesetResource,
  CharacterSheet,
  RollLedgerEntry,
  RollStats,
} from '$lib/types'
import type {
  PresetPack,
  PackTemplate,
  CustomVariable,
  RuntimeVariable,
  RuntimeVariableType,
  RuntimeEntityType,
  EnumOption,
} from '$lib/services/packs/types'
import { hashContent } from '$lib/services/packs/hash'

/**
 * Migrate visual descriptors from old string array format to new structured object format.
 * Handles both old format (string[]) and new format (VisualDescriptors object).
 */
function migrateVisualDescriptors(data: unknown): VisualDescriptors {
  // Already new format (object with known keys)
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    // Check if it has any of our expected keys
    if (
      'face' in obj ||
      'hair' in obj ||
      'eyes' in obj ||
      'build' in obj ||
      'clothing' in obj ||
      'accessories' in obj ||
      'distinguishing' in obj
    ) {
      return data as VisualDescriptors
    }
  }

  // Old format: string array like ["Face: pale skin", "Hair: long brown"]
  if (Array.isArray(data)) {
    const result: VisualDescriptors = {}
    const categoryMap: Record<string, keyof VisualDescriptors> = {
      face: 'face',
      skin: 'face',
      hair: 'hair',
      eyes: 'eyes',
      eye: 'eyes',
      build: 'build',
      height: 'build',
      body: 'build',
      physique: 'build',
      clothing: 'clothing',
      clothes: 'clothing',
      outfit: 'clothing',
      attire: 'clothing',
      accessories: 'accessories',
      accessory: 'accessories',
      distinguishing: 'distinguishing',
      scar: 'distinguishing',
      scars: 'distinguishing',
      marks: 'distinguishing',
      mark: 'distinguishing',
      tattoo: 'distinguishing',
    }

    for (const desc of data) {
      if (typeof desc !== 'string') continue

      // Try to match "Category: value" pattern
      const match = desc.match(/^([A-Za-z\s]+):\s*(.+)$/)
      if (match) {
        const [, category, value] = match
        const key = categoryMap[category.toLowerCase().trim()] || 'distinguishing'
        // Append to existing value if key already exists
        if (result[key]) {
          result[key] = `${result[key]}, ${value.trim()}`
        } else {
          result[key] = value.trim()
        }
      }
    }

    return result
  }

  // Empty or unknown format
  return {}
}

class DatabaseService {
  private db: Database | null = null
  /** Pending open promise — prevents concurrent callers from opening the DB twice. */
  private dbPromise: Promise<Database> | null = null
  /** Serializes explicit transactions on the shared SQLite connection. */
  private transactionQueue: Promise<void> = Promise.resolve()

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private isBusyError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /database is locked|database table is locked|SQLITE_BUSY|code 5/i.test(message)
  }

  async init(): Promise<void> {
    if (this.db) return
    if (!this.dbPromise) {
      this.dbPromise = (async () => {
        const attempts = 3
        let lastError: unknown = null

        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const db = await Database.load('sqlite:aventura-adventure.db')

            // Enable foreign key enforcement (SQLite disables by default).
            // Must run exactly once per connection; placing it here (instead of
            // after the await below) avoids concurrent callers re-issuing it.
            await db.execute('PRAGMA foreign_keys = ON')
            // Wait briefly for another SQLite connection to finish its write
            // instead of failing immediately with SQLITE_BUSY (code 5).
            await db.execute('PRAGMA busy_timeout = 10000')
            await this.ensureRulesetSchema(db)
            this.db = db
            return db
          } catch (error) {
            lastError = error
            this.db = null
            if (attempt < attempts) {
              console.warn(`[Database] init attempt ${attempt} failed, retrying...`, error)
              await this.delay(200 * attempt)
            }
          }
        }

        this.dbPromise = null
        throw lastError instanceof Error ? lastError : new Error('Failed to initialize database')
      })().catch((err) => {
        this.dbPromise = null
        throw err
      })
    }
    await this.dbPromise
  }

  private async ensureRulesetSchema(db: Database): Promise<void> {
    const ensureColumn = async (table: string, column: string, definition: string) => {
      const columns = await db.select<Array<{ name: string }>>(`PRAGMA table_info(${table})`)
      if (!columns.some((entry) => entry.name === column)) {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      }
    }

    await ensureColumn('rulesets', 'encumbrance_mode', "TEXT NOT NULL DEFAULT 'slot'")
    await ensureColumn(
      'rulesets',
      'encumbrance_capacity_formula',
      "TEXT NOT NULL DEFAULT '10 + strength + constitution + level'",
    )
    await ensureColumn(
      'rulesets',
      'inventory_slot_capacity_formula',
      "TEXT NOT NULL DEFAULT '10 + strength + constitution + level'",
    )
    await ensureColumn('ruleset_slots', 'slot_type', "TEXT NOT NULL DEFAULT 'wearable'")
    await ensureColumn('items', 'weight', 'REAL NOT NULL DEFAULT 0')
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_rulesets_encumbrance_mode ON rulesets(encumbrance_mode)',
    )
  }

  /**
   * Close the database connection. After calling this, the next
   * getDb() / init() call will re-open the connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
      this.dbPromise = null
    }
  }

  private async getDb(): Promise<Database> {
    if (!this.db) {
      await this.init()
    }
    return this.db!
  }

  private enqueueWrite<T>(label: string, operation: (db: Database) => Promise<T>): Promise<T> {
    const run = this.transactionQueue.then(async () => {
      const db = await this.getDb()
      console.info(`[Database] write queued: ${label}`)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await operation(db)
          console.info(`[Database] write complete: ${label}`)
          return result
        } catch (error) {
          console.error(`[Database] write failed: ${label}`, {
            attempt,
            busy: this.isBusyError(error),
            error,
          })
          if (!this.isBusyError(error) || attempt === 3) throw error
          await this.delay(250 * attempt)
        }
      }
      throw new Error('Database write failed after retries')
    })

    this.transactionQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * Run a callback inside a BEGIN/COMMIT transaction.
   * Automatically rolls back on error.
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.transactionQueue.then(async () => {
      const db = await this.getDb()
      for (let attempt = 1; attempt <= 3; attempt++) {
        let transactionStarted = false
        // Acquire the write reservation before the callback performs any reads.
        // This avoids a deferred read-to-write upgrade failing with SQLITE_BUSY.
        try {
          console.info(`[Database] transaction begin attempt ${attempt}`)
          await db.execute('BEGIN IMMEDIATE')
          transactionStarted = true
          const result = await fn()
          await db.execute('COMMIT')
          console.info('[Database] transaction committed')
          return result
        } catch (error) {
          console.error('[Database] transaction failed', { attempt, error })
          if (transactionStarted) {
            try {
              await db.execute('ROLLBACK')
            } catch (rollbackError) {
              console.error('[Database] Failed to roll back transaction:', rollbackError)
            }
          }
          if (!this.isBusyError(error) || attempt === 3) {
            throw error
          }
          console.warn(`[Database] Transaction busy; retrying attempt ${attempt + 1}/3`)
          await this.delay(250 * attempt)
        }
      }
      throw new Error('Database transaction failed after retries')
    })

    this.transactionQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * Execute a raw SQL query for debugging purposes.
   * SELECT queries return rows; other queries return affected row count.
   */
  async rawQuery(
    sql: string,
  ): Promise<{ columns: string[]; rows: Record<string, unknown>[]; rowsAffected?: number }> {
    const db = await this.getDb()
    const trimmed = sql.trim().toUpperCase()
    if (
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('PRAGMA') ||
      trimmed.startsWith('EXPLAIN')
    ) {
      const rows = await db.select<Record<string, unknown>[]>(sql)
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return { columns, rows }
    } else {
      const result = await db.execute(sql)
      return {
        columns: ['rowsAffected'],
        rows: [{ rowsAffected: result.rowsAffected }],
        rowsAffected: result.rowsAffected,
      }
    }
  }

  // Settings operations
  async getSetting(key: string): Promise<string | null> {
    const db = await this.getDb()
    const result = await db.select<{ value: string }[]>(
      'SELECT value FROM settings WHERE key = ?',
      [key],
    )
    return result.length > 0 ? result[0].value : null
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
  }

  async deleteSetting(key: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM settings WHERE key = ?', [key])
  }

  // Model health cache operations
  async getModelHealthForKey(
    providerId: string,
    baseUrl: string,
  ): Promise<
    Array<{
      model_id: string
      status: string
      http_code: number | null
      latency_ms: number | null
      quota_percent: number | null
      checked_at: number
    }>
  > {
    const db = await this.getDb()
    return db.select(
      `SELECT model_id, status, http_code, latency_ms, quota_percent, checked_at
       FROM model_health_cache WHERE provider_id = ? AND base_url = ?`,
      [providerId, baseUrl],
    )
  }

  async upsertModelHealthBatch(
    rows: Array<{
      providerId: string
      modelId: string
      baseUrl: string
      status: string
      httpCode: number | null
      latencyMs: number | null
      quotaPercent: number | null
      checkedAt: number
    }>,
  ): Promise<void> {
    if (rows.length === 0) return
    const db = await this.getDb()
    // Chunked to stay below SQLite's SQLITE_LIMIT_VARIABLE_NUMBER.
    // Modern SQLite supports 32766; 1000 rows × 8 params = 8000 — well within limits.
    const BATCH_SIZE = 1000

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE)
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',')
      const values: unknown[] = []

      for (const r of chunk) {
        values.push(
          r.providerId,
          r.modelId,
          r.baseUrl,
          r.status,
          r.httpCode,
          r.latencyMs,
          r.quotaPercent,
          r.checkedAt,
        )
      }

      await db.execute(
        `INSERT INTO model_health_cache
          (provider_id, model_id, base_url, status, http_code, latency_ms, quota_percent, checked_at)
         VALUES ${placeholders}
         ON CONFLICT(provider_id, model_id, base_url)
         DO UPDATE SET
           status        = excluded.status,
           http_code     = excluded.http_code,
           latency_ms    = excluded.latency_ms,
           quota_percent = excluded.quota_percent,
           checked_at    = excluded.checked_at`,
        values,
      )
    }
  }

  async deleteModelHealthForKey(providerId: string, baseUrl: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM model_health_cache WHERE provider_id = ? AND base_url = ?', [
      providerId,
      baseUrl,
    ])
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const db = await this.getDb()
    const results = await db.select<{ key: string; value: string }[]>(
      'SELECT key, value FROM settings',
    )
    const settings: Record<string, string> = {}
    for (const row of results) {
      settings[row.key] = row.value
    }
    return settings
  }

  async vacuumInto(destPath: string): Promise<void> {
    const db = await this.getDb()
    // VACUUM INTO doesn't support parameterized queries in most SQLite wrappers.
    // Escape single quotes in the path to prevent SQL issues.
    const escapedPath = destPath.replace(/'/g, "''")
    await db.execute(`VACUUM INTO '${escapedPath}'`)
  }

  // Story operations
  async getAllStories(): Promise<Story[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM stories ORDER BY updated_at DESC')
    return results.map(this.mapStory)
  }

  async getStory(id: string): Promise<Story | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM stories WHERE id = ?', [id])
    return results.length > 0 ? this.mapStory(results[0]) : null
  }

  async getCampaignByStoryId(storyId: string): Promise<Campaign | null> {
    const db = await this.getDb()
    const rows = await db.select<any[]>('SELECT * FROM campaigns WHERE story_id = ?', [storyId])
    return rows.length > 0 ? this.mapCampaign(rows[0]) : null
  }

  async upsertCampaign(campaign: Campaign): Promise<void> {
    await this.enqueueWrite(`campaign upsert ${campaign.id}`, (db) =>
      db.execute(
        `INSERT INTO campaigns (id, story_id, title, description, ruleset_id, spotlight_character_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           ruleset_id = excluded.ruleset_id,
           spotlight_character_id = excluded.spotlight_character_id,
           status = excluded.status,
           updated_at = excluded.updated_at`,
        [
          campaign.id,
          campaign.storyId,
          campaign.title,
          campaign.description,
          campaign.rulesetId,
          campaign.spotlightCharacterId,
          campaign.status,
          campaign.createdAt,
          campaign.updatedAt,
        ],
      ),
    )
  }

  async updateCampaignSpotlight(campaignId: string, characterId: string | null): Promise<void> {
    await this.enqueueWrite(`campaign spotlight ${campaignId}`, (db) =>
      db.execute('UPDATE campaigns SET spotlight_character_id = ?, updated_at = ? WHERE id = ?', [
        characterId,
        Date.now(),
        campaignId,
      ]),
    )
  }

  async getCampaignSettings(campaignId: string): Promise<CampaignSettings | null> {
    const db = await this.getDb()
    const rows = await db.select<any[]>('SELECT * FROM campaign_settings WHERE campaign_id = ?', [
      campaignId,
    ])
    return rows.length > 0 ? this.mapCampaignSettings(rows[0]) : null
  }

  async upsertCampaignSettings(settings: CampaignSettings): Promise<void> {
    await this.enqueueWrite(`campaign settings upsert ${settings.campaignId}`, (db) =>
      db.execute(
        `INSERT INTO campaign_settings (campaign_id, default_party_size, max_party_size, scene_mode, turn_order_mode, dice_enforcement, nsfw_intensity, world_charter, gm_persona, companion_combat_policy, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(campaign_id) DO UPDATE SET
           default_party_size = excluded.default_party_size,
           max_party_size = excluded.max_party_size,
           scene_mode = excluded.scene_mode,
           turn_order_mode = excluded.turn_order_mode,
           dice_enforcement = excluded.dice_enforcement,
           nsfw_intensity = excluded.nsfw_intensity,
           world_charter = excluded.world_charter,
           gm_persona = excluded.gm_persona,
           companion_combat_policy = excluded.companion_combat_policy,
           updated_at = excluded.updated_at`,
        [
          settings.campaignId,
          settings.defaultPartySize,
          settings.maxPartySize,
          settings.sceneMode,
          settings.turnOrderMode,
          settings.diceEnforcement,
          settings.nsfwIntensity,
          settings.worldCharter,
          settings.gmPersona,
          settings.companionCombatPolicy,
          settings.createdAt,
          settings.updatedAt,
        ],
      ),
    )
  }

  async updateCampaignSettings(
    campaignId: string,
    updates: Partial<Omit<CampaignSettings, 'campaignId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    const columnMap: Record<string, string> = {
      defaultPartySize: 'default_party_size',
      maxPartySize: 'max_party_size',
      sceneMode: 'scene_mode',
      turnOrderMode: 'turn_order_mode',
      diceEnforcement: 'dice_enforcement',
      nsfwIntensity: 'nsfw_intensity',
      worldCharter: 'world_charter',
      gmPersona: 'gm_persona',
      companionCombatPolicy: 'companion_combat_policy',
    }
    const entries = Object.entries(updates).filter(
      ([key, value]) => key in columnMap && value !== undefined,
    )
    if (entries.length === 0) return

    const assignments = entries.map(([key]) => `${columnMap[key]} = ?`).join(', ')
    const values = entries.map(([, value]) => value ?? null)
    values.push(Date.now(), campaignId)
    await this.enqueueWrite(`campaign settings update ${campaignId}`, (db) =>
      db.execute(
        `UPDATE campaign_settings SET ${assignments}, updated_at = ? WHERE campaign_id = ?`,
        values,
      ),
    )
  }

  async getSceneTurnState(
    campaignId: string,
    entryId: string | null = null,
  ): Promise<SceneTurnState | null> {
    const db = await this.getDb()
    const rows =
      entryId === null
        ? await db.select<any[]>(
            'SELECT * FROM scene_turn_states WHERE campaign_id = ? AND entry_id IS NULL ORDER BY updated_at DESC LIMIT 1',
            [campaignId],
          )
        : await db.select<any[]>(
            'SELECT * FROM scene_turn_states WHERE campaign_id = ? AND entry_id = ?',
            [campaignId, entryId],
          )
    return rows.length > 0 ? this.mapSceneTurnState(rows[0]) : null
  }

  async upsertSceneTurnState(state: SceneTurnState): Promise<void> {
    await this.enqueueWrite(`scene turn state upsert ${state.campaignId}`, async (db) => {
      const actorOrder = JSON.stringify(state.actorOrder)

      if (state.entryId === null) {
        const result = await db.execute(
          `UPDATE scene_turn_states
           SET scene_mode = ?, turn_order_mode = ?, active_actor_id = ?, actor_order = ?, turn_number = ?, updated_at = ?
           WHERE campaign_id = ? AND entry_id IS NULL`,
          [
            state.sceneMode,
            state.turnOrderMode,
            state.activeActorId,
            actorOrder,
            state.turnNumber,
            state.updatedAt,
            state.campaignId,
          ],
        )
        if (result.rowsAffected > 0) return
      }

      await db.execute(
        `INSERT INTO scene_turn_states (id, campaign_id, entry_id, scene_mode, turn_order_mode, active_actor_id, actor_order, turn_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(campaign_id, entry_id) DO UPDATE SET
           scene_mode = excluded.scene_mode,
           turn_order_mode = excluded.turn_order_mode,
           active_actor_id = excluded.active_actor_id,
           actor_order = excluded.actor_order,
           turn_number = excluded.turn_number,
           updated_at = excluded.updated_at`,
        [
          state.id,
          state.campaignId,
          state.entryId,
          state.sceneMode,
          state.turnOrderMode,
          state.activeActorId,
          actorOrder,
          state.turnNumber,
          state.createdAt,
          state.updatedAt,
        ],
      )
    })
  }

  async getCampaignPartyMembers(campaignId: string): Promise<CampaignPartyMember[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM party_members WHERE campaign_id = ? ORDER BY display_order ASC, joined_at ASC',
      [campaignId],
    )
    return rows.map(this.mapCampaignPartyMember)
  }

  async getActorControlProfiles(campaignId: string): Promise<ActorControlProfile[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM actor_control_profiles WHERE campaign_id = ?',
      [campaignId],
    )
    return rows.map(this.mapActorControlProfile)
  }

  async upsertCampaignPartyMember(member: CampaignPartyMember): Promise<void> {
    await this.enqueueWrite(`campaign party member upsert ${member.characterId}`, (db) =>
      db.execute(
        `INSERT INTO party_members (id, campaign_id, character_id, display_order, joined_at, left_at, eligibility_status, actor_category, active, narrative_control_mode, combat_control_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(campaign_id, character_id) DO UPDATE SET
           display_order = excluded.display_order,
           left_at = excluded.left_at,
           eligibility_status = excluded.eligibility_status,
           actor_category = excluded.actor_category,
           active = excluded.active,
           narrative_control_mode = excluded.narrative_control_mode,
           combat_control_mode = excluded.combat_control_mode`,
        [
          member.id,
          member.campaignId,
          member.characterId,
          member.displayOrder,
          member.joinedAt,
          member.leftAt,
          member.eligibilityStatus,
          member.actorCategory,
          member.active ? 1 : 0,
          member.narrativeControlMode,
          member.combatControlMode,
        ],
      ),
    )
  }

  async getCampaignSessions(campaignId: string): Promise<CampaignSession[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM campaign_sessions WHERE campaign_id = ? ORDER BY session_number DESC',
      [campaignId],
    )
    return rows.map(this.mapCampaignSession)
  }

  async createCampaignSession(session: CampaignSession): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO campaign_sessions (id, campaign_id, session_number, title, primary_character_id, narrative_control_policy, combat_control_policy, status, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.campaignId,
        session.sessionNumber,
        session.title,
        session.primaryCharacterId,
        session.narrativeControlPolicy,
        session.combatControlPolicy,
        session.status,
        session.startedAt,
        session.endedAt,
      ],
    )
  }

  async endCampaignSession(
    sessionId: string,
    status: 'completed' | 'abandoned' = 'completed',
  ): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      'UPDATE campaign_sessions SET status = ?, ended_at = ? WHERE id = ? AND status = ?',
      [status, Date.now(), sessionId, 'active'],
    )
  }

  async addSessionPartyMember(member: SessionPartyMember): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO session_party_members (id, session_id, character_id, party_order, actor_category, narrative_control_mode, combat_control_mode, joined_at, left_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        member.id,
        member.sessionId,
        member.characterId,
        member.partyOrder,
        member.actorCategory,
        member.narrativeControlMode,
        member.combatControlMode,
        member.joinedAt,
        member.leftAt,
      ],
    )
  }

  async getSessionPartyMembers(sessionId: string): Promise<SessionPartyMember[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM session_party_members WHERE session_id = ? ORDER BY party_order ASC',
      [sessionId],
    )
    return rows.map(this.mapSessionPartyMember)
  }

  async getCampaignThreads(
    campaignId: string,
    options?: { status?: CampaignThread['status']; visibility?: CampaignThread['visibility'] },
  ): Promise<CampaignThread[]> {
    const db = await this.getDb()
    const clauses = ['campaign_id = ?']
    const params: unknown[] = [campaignId]
    if (options?.status) {
      clauses.push('status = ?')
      params.push(options.status)
    }
    if (options?.visibility) {
      clauses.push('visibility = ?')
      params.push(options.visibility)
    }
    const rows = await db.select<any[]>(
      `SELECT * FROM campaign_threads WHERE ${clauses.join(' AND ')} ORDER BY priority DESC, updated_at DESC`,
      params,
    )
    return rows.map(this.mapCampaignThread)
  }

  async upsertCampaignThread(thread: CampaignThread): Promise<void> {
    await this.enqueueWrite(`campaign thread upsert ${thread.id}`, (db) =>
      db.execute(
        `INSERT INTO campaign_threads (id, campaign_id, title, summary, thread_type, status, visibility, priority, clock_value, clock_max, stakes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           summary = excluded.summary,
           thread_type = excluded.thread_type,
           status = excluded.status,
           visibility = excluded.visibility,
           priority = excluded.priority,
           clock_value = excluded.clock_value,
           clock_max = excluded.clock_max,
           stakes = excluded.stakes,
           updated_at = excluded.updated_at`,
        [
          thread.id,
          thread.campaignId,
          thread.title,
          thread.summary,
          thread.threadType,
          thread.status,
          thread.visibility,
          thread.priority,
          thread.clockValue,
          thread.clockMax,
          thread.stakes,
          thread.createdAt,
          thread.updatedAt,
        ],
      ),
    )
  }

  async deleteCampaignThread(threadId: string): Promise<void> {
    await this.enqueueWrite(`campaign thread delete ${threadId}`, (db) =>
      db.execute('DELETE FROM campaign_threads WHERE id = ?', [threadId]),
    )
  }

  async getCampaignThreadBeats(
    campaignId: string,
    options?: { threadId?: string; visibility?: CampaignThreadBeat['visibility'] },
  ): Promise<CampaignThreadBeat[]> {
    const db = await this.getDb()
    const clauses = ['campaign_id = ?']
    const params: unknown[] = [campaignId]
    if (options?.threadId) {
      clauses.push('thread_id = ?')
      params.push(options.threadId)
    }
    if (options?.visibility) {
      clauses.push('visibility = ?')
      params.push(options.visibility)
    }
    const rows = await db.select<any[]>(
      `SELECT * FROM campaign_thread_beats WHERE ${clauses.join(' AND ')} ORDER BY sort_order ASC, created_at ASC`,
      params,
    )
    return rows.map(this.mapCampaignThreadBeat)
  }

  async upsertCampaignThreadBeat(beat: CampaignThreadBeat): Promise<void> {
    await this.enqueueWrite(`campaign thread beat upsert ${beat.id}`, (db) =>
      db.execute(
        `INSERT INTO campaign_thread_beats (id, campaign_id, thread_id, title, summary, beat_type, visibility, sort_order, occurred_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           summary = excluded.summary,
           beat_type = excluded.beat_type,
           visibility = excluded.visibility,
           sort_order = excluded.sort_order,
           occurred_at = excluded.occurred_at,
           updated_at = excluded.updated_at`,
        [
          beat.id,
          beat.campaignId,
          beat.threadId,
          beat.title,
          beat.summary,
          beat.beatType,
          beat.visibility,
          beat.sortOrder,
          beat.occurredAt,
          beat.createdAt,
          beat.updatedAt,
        ],
      ),
    )
  }

  async deleteCampaignThreadBeat(beatId: string): Promise<void> {
    await this.enqueueWrite(`campaign thread beat delete ${beatId}`, (db) =>
      db.execute('DELETE FROM campaign_thread_beats WHERE id = ?', [beatId]),
    )
  }

  // ===== Ruleset Operations (Phase 2) =====

  async getAllRulesets(): Promise<Ruleset[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>('SELECT * FROM rulesets ORDER BY name ASC')
    return rows.map(this.mapRuleset)
  }

  async getRuleset(id: string): Promise<Ruleset | null> {
    const db = await this.getDb()
    const rows = await db.select<any[]>('SELECT * FROM rulesets WHERE id = ?', [id])
    return rows.length > 0 ? this.mapRuleset(rows[0]) : null
  }

  async upsertRuleset(ruleset: Ruleset): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO rulesets (id, name, description, is_builtin, dice_system, default_check_rule_key, encumbrance_mode, encumbrance_capacity_formula, inventory_slot_capacity_formula, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         is_builtin = excluded.is_builtin,
         dice_system = excluded.dice_system,
         default_check_rule_key = excluded.default_check_rule_key,
         encumbrance_mode = excluded.encumbrance_mode,
         encumbrance_capacity_formula = excluded.encumbrance_capacity_formula,
         inventory_slot_capacity_formula = excluded.inventory_slot_capacity_formula,
         updated_at = excluded.updated_at`,
      [
        ruleset.id,
        ruleset.name,
        ruleset.description,
        ruleset.isBuiltin ? 1 : 0,
        ruleset.diceSystem,
        ruleset.defaultCheckRuleKey,
        ruleset.encumbranceMode,
        ruleset.encumbranceCapacityFormula,
        ruleset.inventorySlotCapacityFormula,
        ruleset.createdAt,
        ruleset.updatedAt,
      ],
    )
  }

  async countCampaignsUsingRuleset(rulesetId: string): Promise<number> {
    const db = await this.getDb()
    const rows = await db.select<Array<{ count: number }>>(
      'SELECT COUNT(*) AS count FROM campaigns WHERE ruleset_id = ?',
      [rulesetId],
    )
    return Number(rows[0]?.count ?? 0)
  }

  async deleteRuleset(rulesetId: string): Promise<void> {
    const inUse = await this.countCampaignsUsingRuleset(rulesetId)
    if (inUse > 0) {
      throw new Error(
        `This ruleset is used by ${inUse} campaign${inUse === 1 ? '' : 's'}. Assign another ruleset before deleting it.`,
      )
    }
    await this.enqueueWrite(`ruleset delete ${rulesetId}`, (db) =>
      db.execute('DELETE FROM rulesets WHERE id = ? AND is_builtin = 0', [rulesetId]),
    )
  }

  async getRulesetStats(rulesetId: string): Promise<RulesetStat[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_stats WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetStat)
  }

  async upsertRulesetStat(stat: RulesetStat): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_stats (id, ruleset_id, key, label, default_value, min_value, max_value, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET
         label = excluded.label,
         default_value = excluded.default_value,
         min_value = excluded.min_value,
         max_value = excluded.max_value,
         sort_order = excluded.sort_order`,
      [
        stat.id,
        stat.rulesetId,
        stat.key,
        stat.label,
        stat.defaultValue,
        stat.minValue,
        stat.maxValue,
        stat.sortOrder,
      ],
    )
  }

  async getRulesetSkills(rulesetId: string): Promise<RulesetSkill[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_skills WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetSkill)
  }

  async upsertRulesetSkill(skill: RulesetSkill): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_skills (id, ruleset_id, key, label, governing_stat_key, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET
         label = excluded.label,
         governing_stat_key = excluded.governing_stat_key,
         sort_order = excluded.sort_order`,
      [skill.id, skill.rulesetId, skill.key, skill.label, skill.governingStatKey, skill.sortOrder],
    )
  }

  async getRulesetCheckRules(rulesetId: string): Promise<RulesetCheckRule[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_check_rules WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetCheckRule)
  }

  async upsertRulesetCheckRule(rule: RulesetCheckRule): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_check_rules (id, ruleset_id, key, label, notation, critical_success_threshold, critical_failure_threshold, outcome_bands, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET
         label = excluded.label,
         notation = excluded.notation,
         critical_success_threshold = excluded.critical_success_threshold,
         critical_failure_threshold = excluded.critical_failure_threshold,
         outcome_bands = excluded.outcome_bands,
         sort_order = excluded.sort_order`,
      [
        rule.id,
        rule.rulesetId,
        rule.key,
        rule.label,
        rule.notation,
        rule.criticalSuccessThreshold,
        rule.criticalFailureThreshold,
        JSON.stringify(rule.outcomeBands),
        rule.sortOrder,
      ],
    )
  }

  async getRulesetConditions(rulesetId: string): Promise<RulesetCondition[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_conditions WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetCondition)
  }

  async upsertRulesetCondition(condition: RulesetCondition): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_conditions (id, ruleset_id, key, label, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET
         label = excluded.label,
         description = excluded.description,
         sort_order = excluded.sort_order`,
      [
        condition.id,
        condition.rulesetId,
        condition.key,
        condition.label,
        condition.description,
        condition.sortOrder,
      ],
    )
  }

  async getRulesetSlots(rulesetId: string): Promise<RulesetSlot[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_slots WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetSlot)
  }

  async upsertRulesetSlot(slot: RulesetSlot): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_slots (id, ruleset_id, key, label, slot_type, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET
         label = excluded.label,
         slot_type = excluded.slot_type,
         sort_order = excluded.sort_order`,
      [slot.id, slot.rulesetId, slot.key, slot.label, slot.slotType, slot.sortOrder],
    )
  }

  async getRulesetAbilities(rulesetId: string): Promise<RulesetAbility[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_abilities WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetAbility)
  }

  async upsertRulesetAbility(ability: RulesetAbility): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_abilities (id, ruleset_id, key, label, description, resource_key, resource_cost, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET
         label = excluded.label,
         description = excluded.description,
         resource_key = excluded.resource_key,
         resource_cost = excluded.resource_cost,
         sort_order = excluded.sort_order`,
      [
        ability.id,
        ability.rulesetId,
        ability.key,
        ability.label,
        ability.description,
        ability.resourceKey,
        ability.resourceCost,
        ability.sortOrder,
      ],
    )
  }

  async getRulesetLevels(rulesetId: string): Promise<RulesetLevel[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_levels WHERE ruleset_id = ? ORDER BY level ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetLevel)
  }

  async upsertRulesetLevel(level: RulesetLevel): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_levels (id, ruleset_id, level, label, xp_threshold, stat_bonuses)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, level) DO UPDATE SET
         label = excluded.label,
         xp_threshold = excluded.xp_threshold,
         stat_bonuses = excluded.stat_bonuses`,
      [
        level.id,
        level.rulesetId,
        level.level,
        level.label,
        level.xpThreshold,
        level.statBonuses ? JSON.stringify(level.statBonuses) : null,
      ],
    )
  }

  async getRulesetResources(rulesetId: string): Promise<RulesetResource[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_resources WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetResource)
  }

  async getRulesetSpells(rulesetId: string): Promise<RulesetSpell[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_spells WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetSpell)
  }

  async upsertRulesetSpell(spell: RulesetSpell): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_spells (id, ruleset_id, key, label, description, level, notation, resource_cost, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET label = excluded.label, description = excluded.description, level = excluded.level, notation = excluded.notation, resource_cost = excluded.resource_cost, sort_order = excluded.sort_order`,
      [
        spell.id,
        spell.rulesetId,
        spell.key,
        spell.label,
        spell.description,
        spell.level,
        spell.notation,
        spell.resourceCost,
        spell.sortOrder,
      ],
    )
  }

  async getRulesetCreatures(rulesetId: string): Promise<RulesetCreature[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT * FROM ruleset_creatures WHERE ruleset_id = ? ORDER BY sort_order ASC',
      [rulesetId],
    )
    return rows.map(this.mapRulesetCreature)
  }

  async upsertRulesetCreature(creature: RulesetCreature): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_creatures (id, ruleset_id, key, label, description, creature_type, stat_block, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET label = excluded.label, description = excluded.description, creature_type = excluded.creature_type, stat_block = excluded.stat_block, sort_order = excluded.sort_order`,
      [
        creature.id,
        creature.rulesetId,
        creature.key,
        creature.label,
        creature.description,
        creature.creatureType,
        JSON.stringify(creature.statBlock),
        creature.sortOrder,
      ],
    )
  }

  async upsertRulesetResource(resource: RulesetResource): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO ruleset_resources (id, ruleset_id, key, label, max_formula, min_value, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ruleset_id, key) DO UPDATE SET
         label = excluded.label,
         max_formula = excluded.max_formula,
         min_value = excluded.min_value,
         sort_order = excluded.sort_order`,
      [
        resource.id,
        resource.rulesetId,
        resource.key,
        resource.label,
        resource.maxFormula,
        resource.minValue,
        resource.sortOrder,
      ],
    )
  }

  async deleteRulesetDefinition(
    kind:
      | 'stat'
      | 'skill'
      | 'check_rule'
      | 'condition'
      | 'slot'
      | 'ability'
      | 'level'
      | 'resource'
      | 'spell'
      | 'creature',
    id: string,
  ): Promise<void> {
    const tables = {
      stat: 'ruleset_stats',
      skill: 'ruleset_skills',
      check_rule: 'ruleset_check_rules',
      condition: 'ruleset_conditions',
      slot: 'ruleset_slots',
      ability: 'ruleset_abilities',
      level: 'ruleset_levels',
      resource: 'ruleset_resources',
      spell: 'ruleset_spells',
      creature: 'ruleset_creatures',
    } as const
    await this.enqueueWrite(`ruleset ${kind} delete ${id}`, (db) =>
      db.execute(`DELETE FROM ${tables[kind]} WHERE id = ?`, [id]),
    )
  }

  // ===== Character Sheet Operations (Phase 3) =====

  async getCharacterSheet(characterId: string): Promise<CharacterSheet | null> {
    const db = await this.getDb()
    const rows = await db.select<any[]>('SELECT * FROM character_sheets WHERE character_id = ?', [
      characterId,
    ])
    return rows.length > 0 ? this.mapCharacterSheet(rows[0]) : null
  }

  async upsertCharacterSheet(sheet: CharacterSheet): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO character_sheets (character_id, ruleset_id, stat_values, resource_values, condition_states, level, xp, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(character_id) DO UPDATE SET
         ruleset_id = excluded.ruleset_id,
         stat_values = excluded.stat_values,
         resource_values = excluded.resource_values,
         condition_states = excluded.condition_states,
         level = excluded.level,
         xp = excluded.xp,
         updated_at = excluded.updated_at`,
      [
        sheet.characterId,
        sheet.rulesetId,
        JSON.stringify(sheet.statValues),
        JSON.stringify(sheet.resourceValues),
        JSON.stringify(sheet.conditionStates),
        sheet.level,
        sheet.xp,
        sheet.createdAt,
        sheet.updatedAt,
      ],
    )
  }

  // ===== Roll Ledger Operations (Phase 2) =====

  async addRollLedgerEntry(entry: RollLedgerEntry): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO roll_ledger (id, campaign_id, session_id, actor_id, notation, seed, rolls, modifier, total, dc, outcome, reason, visibility, bias_applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.campaignId,
        entry.sessionId,
        entry.actorId,
        entry.notation,
        entry.seed,
        JSON.stringify(entry.rolls),
        entry.modifier,
        entry.total,
        entry.dc,
        entry.outcome,
        entry.reason,
        entry.visibility,
        entry.biasApplied ? JSON.stringify(entry.biasApplied) : null,
        entry.createdAt,
      ],
    )
  }

  async getRollLedger(
    campaignId: string,
    options?: { sessionId?: string; actorId?: string; limit?: number },
  ): Promise<RollLedgerEntry[]> {
    const db = await this.getDb()
    const clauses = ['campaign_id = ?']
    const params: unknown[] = [campaignId]
    if (options?.sessionId) {
      clauses.push('session_id = ?')
      params.push(options.sessionId)
    }
    if (options?.actorId) {
      clauses.push('actor_id = ?')
      params.push(options.actorId)
    }
    let query = `SELECT * FROM roll_ledger WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`
    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)
    }
    const rows = await db.select<any[]>(query, params)
    return rows.map(this.mapRollLedgerEntry)
  }

  /** Aggregate roll stats for a campaign (optionally scoped to one actor). */
  async getRollStats(campaignId: string, actorId?: string): Promise<RollStats> {
    const db = await this.getDb()
    const clauses = ['campaign_id = ?']
    const params: unknown[] = [campaignId]
    if (actorId) {
      clauses.push('actor_id = ?')
      params.push(actorId)
    }
    const rows = await db.select<any[]>(
      `SELECT COUNT(*) as count, AVG(total) as average, MIN(total) as min, MAX(total) as max,
              SUM(CASE WHEN outcome = 'critical_success' THEN 1 ELSE 0 END) as critical_successes,
              SUM(CASE WHEN outcome = 'critical_failure' THEN 1 ELSE 0 END) as critical_failures
       FROM roll_ledger WHERE ${clauses.join(' AND ')}`,
      params,
    )
    const row = rows[0]
    return {
      count: row?.count ?? 0,
      average: row?.average ?? 0,
      min: row?.min ?? 0,
      max: row?.max ?? 0,
      criticalSuccesses: row?.critical_successes ?? 0,
      criticalFailures: row?.critical_failures ?? 0,
    }
  }

  async createStory(story: Omit<Story, 'createdAt' | 'updatedAt'>): Promise<Story> {
    const db = await this.getDb()
    const now = Date.now()
    await db.execute(
      `INSERT INTO stories (
        id,
        title,
        description,
        genre,
        template_id,
        mode,
        folder_id,
        created_at,
        updated_at,
        settings,
        memory_config,
        retry_state,
        style_review_state,
        time_tracker
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        story.id,
        story.title,
        story.description,
        story.genre,
        story.templateId,
        story.mode || 'adventure',
        story.folderId ?? null,
        now,
        now,
        story.settings ? JSON.stringify(story.settings) : null,
        story.memoryConfig ? JSON.stringify(story.memoryConfig) : null,
        story.retryState ? JSON.stringify(story.retryState) : null,
        story.styleReviewState ? JSON.stringify(story.styleReviewState) : null,
        story.timeTracker ? JSON.stringify(story.timeTracker) : null,
      ],
    )
    return { ...story, createdAt: now, updatedAt: now }
  }

  async updateStory(id: string, updates: Partial<Story>): Promise<void> {
    const db = await this.getDb()
    const now = Date.now()
    const setClauses: string[] = ['updated_at = ?']
    const values: any[] = [now]

    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.genre !== undefined) {
      setClauses.push('genre = ?')
      values.push(updates.genre)
    }
    if (updates.mode !== undefined) {
      setClauses.push('mode = ?')
      values.push(updates.mode)
    }
    if (updates.folderId !== undefined) {
      setClauses.push('folder_id = ?')
      values.push(updates.folderId)
    }
    if (updates.settings !== undefined) {
      setClauses.push('settings = ?')
      values.push(JSON.stringify(updates.settings))
    }
    if (updates.memoryConfig !== undefined) {
      setClauses.push('memory_config = ?')
      values.push(updates.memoryConfig ? JSON.stringify(updates.memoryConfig) : null)
    }
    if (updates.retryState !== undefined) {
      setClauses.push('retry_state = ?')
      values.push(updates.retryState ? JSON.stringify(updates.retryState) : null)
    }
    if (updates.styleReviewState !== undefined) {
      setClauses.push('style_review_state = ?')
      values.push(updates.styleReviewState ? JSON.stringify(updates.styleReviewState) : null)
    }
    if (updates.timeTracker !== undefined) {
      setClauses.push('time_tracker = ?')
      values.push(updates.timeTracker ? JSON.stringify(updates.timeTracker) : null)
    }
    if (updates.currentBgImage !== undefined) {
      setClauses.push('current_background_image = ?')
      values.push(updates.currentBgImage)
    }

    values.push(id)
    await db.execute(`UPDATE stories SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  /**
   * Save retry state for a story.
   */
  async saveRetryState(storyId: string, retryState: PersistentRetryState): Promise<void> {
    const db = await this.getDb()
    console.log('[Database] Saving retry state', {
      storyId,
      hasCharacterSnapshots: !!retryState.characterSnapshots,
      characterSnapshotsCount: retryState.characterSnapshots?.length ?? 0,
      characterSnapshots: retryState.characterSnapshots?.map((s) => ({
        id: s.id,
        visualDescriptors: s.visualDescriptors,
        traits: s.traits,
      })),
    })
    await db.execute('UPDATE stories SET retry_state = ? WHERE id = ?', [
      JSON.stringify(retryState),
      storyId,
    ])
  }

  /**
   * Clear retry state for a story.
   */
  async clearRetryState(storyId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET retry_state = NULL WHERE id = ?', [storyId])
  }

  /**
   * Save style review state for a story.
   */
  async saveStyleReviewState(
    storyId: string,
    styleReviewState: PersistentStyleReviewState,
  ): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET style_review_state = ? WHERE id = ?', [
      JSON.stringify(styleReviewState),
      storyId,
    ])
  }

  /**
   * Clear style review state for a story.
   */
  async clearStyleReviewState(storyId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET style_review_state = NULL WHERE id = ?', [storyId])
  }

  /**
   * Save time tracker for a story.
   */
  async saveTimeTracker(storyId: string, timeTracker: TimeTracker): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET time_tracker = ? WHERE id = ?', [
      JSON.stringify(timeTracker),
      storyId,
    ])
  }

  /**
   * Clear time tracker for a story.
   */
  async clearTimeTracker(storyId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET time_tracker = NULL WHERE id = ?', [storyId])
  }

  async deleteStory(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM stories WHERE id = ?', [id])
  }

  async getStoryFolders(): Promise<StoryFolder[]> {
    const db = await this.getDb()
    const rows = await db.select<any[]>(
      'SELECT id, name, created_at, updated_at FROM story_folders ORDER BY LOWER(name) ASC',
    )
    return rows.map(this.mapStoryFolder)
  }

  async createStoryFolder(name: string): Promise<StoryFolder> {
    const db = await this.getDb()
    const now = Date.now()
    const id = crypto.randomUUID()
    await db.execute(
      'INSERT INTO story_folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [id, name.trim(), now, now],
    )
    return { id, name: name.trim(), createdAt: now, updatedAt: now }
  }

  async renameStoryFolder(id: string, name: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE story_folders SET name = ?, updated_at = ? WHERE id = ?', [
      name.trim(),
      Date.now(),
      id,
    ])
  }

  async deleteStoryFolder(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET folder_id = NULL WHERE folder_id = ?', [id])
    await db.execute('DELETE FROM story_folders WHERE id = ?', [id])
  }

  async assignStoryFolder(storyId: string, folderId: string | null): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET folder_id = ?, updated_at = ? WHERE id = ?', [
      folderId,
      Date.now(),
      storyId,
    ])
  }

  // Story entries operations
  async getStoryEntries(
    storyId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<StoryEntry[]> {
    const db = await this.getDb()
    let query = 'SELECT * FROM story_entries WHERE story_id = ? ORDER BY position ASC'
    const params: any[] = [storyId]

    if (options?.limit !== undefined) {
      query += ' LIMIT ?'
      params.push(options.limit)
      if (options?.offset !== undefined) {
        query += ' OFFSET ?'
        params.push(options.offset)
      }
    }

    const results = await db.select<any[]>(query, params)
    return results.map(this.mapStoryEntry)
  }

  /**
   * Get story entries filtered by branch.
   * @param storyId - The story ID
   * @param branchId - The branch ID (null for main branch entries)
   * @param maxPosition - Optional max position (inclusive) for inherited entries
   */
  async getStoryEntriesForBranch(
    storyId: string,
    branchId: string | null,
    maxPosition?: number,
  ): Promise<StoryEntry[]> {
    const db = await this.getDb()

    let query: string
    let params: any[]

    if (branchId === null) {
      // Main branch: entries with null branch_id
      if (maxPosition !== undefined) {
        // Limit to entries up to a certain position (for inherited entries)
        query =
          'SELECT * FROM story_entries WHERE story_id = ? AND branch_id IS NULL AND position <= ? ORDER BY position ASC'
        params = [storyId, maxPosition]
      } else {
        query =
          'SELECT * FROM story_entries WHERE story_id = ? AND branch_id IS NULL ORDER BY position ASC'
        params = [storyId]
      }
    } else {
      // Specific branch
      if (maxPosition !== undefined) {
        query =
          'SELECT * FROM story_entries WHERE story_id = ? AND branch_id = ? AND position <= ? ORDER BY position ASC'
        params = [storyId, branchId, maxPosition]
      } else {
        query =
          'SELECT * FROM story_entries WHERE story_id = ? AND branch_id = ? ORDER BY position ASC'
        params = [storyId, branchId]
      }
    }

    const results = await db.select<any[]>(query, params)
    return results.map(this.mapStoryEntry)
  }

  async getStoryEntry(id: string): Promise<StoryEntry | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM story_entries WHERE id = ?', [id])
    return results.length > 0 ? this.mapStoryEntry(results[0]) : null
  }

  /**
   * Get the count of story entries without loading them all.
   * Useful for UI display and pagination calculations.
   */
  async getStoryEntryCount(storyId: string): Promise<number> {
    const db = await this.getDb()
    const result = await db.select<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM story_entries WHERE story_id = ?',
      [storyId],
    )
    return result[0]?.count ?? 0
  }

  /**
   * Get the most recent story entries (for UI rendering).
   * More efficient than loading all entries for large stories.
   */
  async getRecentStoryEntries(storyId: string, count: number): Promise<StoryEntry[]> {
    const db = await this.getDb()
    // Get the last N entries by position
    const results = await db.select<any[]>(
      `SELECT * FROM story_entries WHERE story_id = ?
       ORDER BY position DESC LIMIT ?`,
      [storyId, count],
    )
    // Reverse to get correct chronological order
    return results.map(this.mapStoryEntry).reverse()
  }

  async addStoryEntry(entry: Omit<StoryEntry, 'createdAt'>): Promise<StoryEntry> {
    const db = await this.getDb()
    const now = Date.now()
    await db.execute(
      `INSERT INTO story_entries (id, story_id, type, content, parent_id, position, created_at, metadata, branch_id, reasoning, translated_content, translation_language, original_input, world_state_delta, suggested_actions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.storyId,
        entry.type,
        entry.content,
        entry.parentId,
        entry.position,
        now,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.branchId || null,
        entry.reasoning || null,
        entry.translatedContent || null,
        entry.translationLanguage || null,
        entry.originalInput || null,
        entry.worldStateDelta ? JSON.stringify(entry.worldStateDelta) : null,
        entry.suggestedActions || null,
      ],
    )
    return { ...entry, createdAt: now }
  }

  async getNextEntryPosition(storyId: string, branchId?: string | null): Promise<number> {
    const db = await this.getDb()

    if (branchId === undefined || branchId === null) {
      // Main branch: max position of null branch_id entries
      const result = await db.select<{ maxPos: number | null }[]>(
        'SELECT MAX(position) as maxPos FROM story_entries WHERE story_id = ? AND branch_id IS NULL',
        [storyId],
      )
      return (result[0]?.maxPos ?? -1) + 1
    } else {
      // Non-main branch: max position of branch-specific entries
      const result = await db.select<{ maxPos: number | null }[]>(
        'SELECT MAX(position) as maxPos FROM story_entries WHERE story_id = ? AND branch_id = ?',
        [storyId, branchId],
      )

      if (result[0]?.maxPos !== null) {
        return result[0].maxPos + 1
      }

      // No branch-specific entries yet - get the fork position from branch record
      const branchResult = await db.select<{ fork_entry_id: string }[]>(
        'SELECT fork_entry_id FROM branches WHERE id = ?',
        [branchId],
      )

      if (branchResult.length > 0) {
        const forkEntryResult = await db.select<{ position: number }[]>(
          'SELECT position FROM story_entries WHERE id = ?',
          [branchResult[0].fork_entry_id],
        )
        if (forkEntryResult.length > 0) {
          // Start branch entries right after the fork point
          return forkEntryResult[0].position + 1
        }
        // Fork entry was deleted - this indicates database corruption
        console.error(
          `[DatabaseService] Branch ${branchId} references missing fork entry: ${branchResult[0].fork_entry_id}`,
        )
        throw new Error(`Branch fork entry not found. The branch may be corrupted.`)
      }

      // Branch record not found
      console.error(`[DatabaseService] Branch not found: ${branchId}`)
      throw new Error(`Branch not found: ${branchId}`)
    }
  }

  async updateStoryEntry(id: string, updates: Partial<StoryEntry>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.content !== undefined) {
      setClauses.push('content = ?')
      values.push(updates.content)
    }
    if (updates.type !== undefined) {
      setClauses.push('type = ?')
      values.push(updates.type)
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null)
    }
    if (updates.reasoning !== undefined) {
      setClauses.push('reasoning = ?')
      values.push(updates.reasoning || null)
    }
    // Translation fields
    if (updates.translatedContent !== undefined) {
      setClauses.push('translated_content = ?')
      values.push(updates.translatedContent || null)
    }
    if (updates.translationLanguage !== undefined) {
      setClauses.push('translation_language = ?')
      values.push(updates.translationLanguage || null)
    }
    if (updates.originalInput !== undefined) {
      setClauses.push('original_input = ?')
      values.push(updates.originalInput || null)
    }
    if (updates.worldStateDelta !== undefined) {
      setClauses.push('world_state_delta = ?')
      values.push(updates.worldStateDelta ? JSON.stringify(updates.worldStateDelta) : null)
    }
    if (updates.suggestedActions !== undefined) {
      setClauses.push('suggested_actions = ?')
      values.push(updates.suggestedActions || null)
    }

    if (setClauses.length === 0) return
    values.push(id)
    await db.execute(`UPDATE story_entries SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteStoryEntry(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM story_entries WHERE id = ?', [id])
  }

  /**
   * Delete all main-branch entries for a story (branch_id IS NULL).
   * Also clears related world_state_snapshots so stale snapshots don't
   * reference non-existent entry positions after the import.
   * Used by the SillyTavern chat import to overwrite story content.
   */
  async clearStoryEntries(storyId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM story_entries WHERE story_id = ? AND branch_id IS NULL', [
      storyId,
    ])
    await db.execute('DELETE FROM world_state_snapshots WHERE story_id = ? AND branch_id IS NULL', [
      storyId,
    ])
  }

  /**
   * Reset mutable world state for a story after a SillyTavern chat import.
   * Bulk-deletes main-branch locations, items, and story beats, then
   * clears the time tracker on the story row.
   * Characters and lorebook entries are intentionally NOT touched.
   */
  async resetWorldStateForImport(storyId: string): Promise<void> {
    const db = await this.getDb()
    await Promise.all([
      db.execute('DELETE FROM locations WHERE story_id = ? AND branch_id IS NULL', [storyId]),
      db.execute('DELETE FROM items WHERE story_id = ? AND branch_id IS NULL', [storyId]),
      db.execute('DELETE FROM story_beats WHERE story_id = ? AND branch_id IS NULL', [storyId]),
      db.execute('UPDATE stories SET time_tracker = NULL WHERE id = ?', [storyId]),
    ])
  }

  /**
   * Bulk-insert story entries in batched multi-row INSERTs.
   * Reduces IPC round-trips from O(n) to O(n/BATCH_SIZE).
   * 15 parameters per row × BATCH_SIZE 50 = 750 params/batch,
   * safely under SQLite's 999-variable limit.
   * All entries share a single createdAt timestamp.
   */
  async bulkInsertStoryEntries(entries: Omit<StoryEntry, 'createdAt'>[]): Promise<void> {
    if (entries.length === 0) return
    const db = await this.getDb()
    const now = Date.now()
    const BATCH_SIZE = 50

    for (let batchStart = 0; batchStart < entries.length; batchStart += BATCH_SIZE) {
      const batch = entries.slice(batchStart, batchStart + BATCH_SIZE)
      const valuePlaceholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')
      const values: unknown[] = []

      for (const entry of batch) {
        values.push(
          entry.id,
          entry.storyId,
          entry.type,
          entry.content,
          entry.parentId,
          entry.position,
          now,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          entry.branchId || null,
          entry.reasoning || null,
          entry.translatedContent || null,
          entry.translationLanguage || null,
          entry.originalInput || null,
          entry.worldStateDelta ? JSON.stringify(entry.worldStateDelta) : null,
          entry.suggestedActions || null,
        )
      }

      await db.execute(
        `INSERT INTO story_entries (id, story_id, type, content, parent_id, position, created_at, metadata, branch_id, reasoning, translated_content, translation_language, original_input, world_state_delta, suggested_actions)
         VALUES ${valuePlaceholders}`,
        values,
      )
    }
  }

  /**
   * Delete multiple story entries by ID.
   */
  async deleteStoryEntries(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const db = await this.getDb()
    const placeholders = ids.map(() => '?').join(',')
    await db.execute(`DELETE FROM story_entries WHERE id IN (${placeholders})`, ids)
  }

  // Character operations
  async getCharacters(storyId: string): Promise<Character[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM characters WHERE story_id = ?', [storyId])
    return results.map(this.mapCharacter)
  }

  /**
   * Get characters filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getCharactersForBranch(storyId: string, branchId: string | null): Promise<Character[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM characters WHERE story_id = ? AND branch_id IS NULL'
        : 'SELECT * FROM characters WHERE story_id = ? AND branch_id = ?',
      branchId === null ? [storyId] : [storyId, branchId],
    )
    return results.map(this.mapCharacter)
  }

  async addCharacter(character: Character): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO characters (id, story_id, name, description, relationship, traits, visual_descriptors, portrait, status, metadata, branch_id, overrides_id, deleted, translated_name, translated_description, translated_relationship, translated_traits, translated_visual_descriptors, translation_language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        character.id,
        character.storyId,
        character.name,
        character.description,
        character.relationship,
        JSON.stringify(character.traits),
        JSON.stringify(character.visualDescriptors || {}),
        character.portrait || null,
        character.status,
        character.metadata ? JSON.stringify(character.metadata) : null,
        character.branchId || null,
        character.overridesId || null,
        character.deleted ? 1 : 0,
        character.translatedName || null,
        character.translatedDescription || null,
        character.translatedRelationship || null,
        character.translatedTraits ? JSON.stringify(character.translatedTraits) : null,
        character.translatedVisualDescriptors
          ? JSON.stringify(character.translatedVisualDescriptors)
          : null,
        character.translationLanguage || null,
      ],
    )
  }

  async updateCharacter(id: string, updates: Partial<Character>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.relationship !== undefined) {
      setClauses.push('relationship = ?')
      values.push(updates.relationship)
    }
    if (updates.traits !== undefined) {
      setClauses.push('traits = ?')
      values.push(JSON.stringify(updates.traits))
    }
    if (updates.visualDescriptors !== undefined) {
      setClauses.push('visual_descriptors = ?')
      values.push(JSON.stringify(updates.visualDescriptors))
    }
    if (updates.portrait !== undefined) {
      setClauses.push('portrait = ?')
      values.push(updates.portrait)
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      values.push(updates.status)
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      values.push(JSON.stringify(updates.metadata))
    }
    // Translation fields
    if (updates.translatedName !== undefined) {
      setClauses.push('translated_name = ?')
      values.push(updates.translatedName || null)
    }
    if (updates.translatedDescription !== undefined) {
      setClauses.push('translated_description = ?')
      values.push(updates.translatedDescription || null)
    }
    if (updates.translatedRelationship !== undefined) {
      setClauses.push('translated_relationship = ?')
      values.push(updates.translatedRelationship || null)
    }
    if (updates.translatedTraits !== undefined) {
      setClauses.push('translated_traits = ?')
      values.push(updates.translatedTraits ? JSON.stringify(updates.translatedTraits) : null)
    }
    if (updates.translatedVisualDescriptors !== undefined) {
      setClauses.push('translated_visual_descriptors = ?')
      values.push(
        updates.translatedVisualDescriptors
          ? JSON.stringify(updates.translatedVisualDescriptors)
          : null,
      )
    }
    if (updates.translationLanguage !== undefined) {
      setClauses.push('translation_language = ?')
      values.push(updates.translationLanguage || null)
    }

    if (setClauses.length === 0) return
    values.push(id)
    await db.execute(`UPDATE characters SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteCharacter(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM characters WHERE id = ?', [id])
  }

  // Location operations
  async getLocations(storyId: string): Promise<Location[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM locations WHERE story_id = ?', [storyId])
    return results.map(this.mapLocation)
  }

  /**
   * Get locations filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getLocationsForBranch(storyId: string, branchId: string | null): Promise<Location[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM locations WHERE story_id = ? AND branch_id IS NULL'
        : 'SELECT * FROM locations WHERE story_id = ? AND branch_id = ?',
      branchId === null ? [storyId] : [storyId, branchId],
    )
    return results.map(this.mapLocation)
  }

  async addLocation(location: Location): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO locations (id, story_id, name, description, visited, current, connections, metadata, branch_id, overrides_id, deleted, translated_name, translated_description, translation_language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        location.id,
        location.storyId,
        location.name,
        location.description,
        location.visited ? 1 : 0,
        location.current ? 1 : 0,
        JSON.stringify(location.connections),
        location.metadata ? JSON.stringify(location.metadata) : null,
        location.branchId || null,
        location.overridesId || null,
        location.deleted ? 1 : 0,
        location.translatedName || null,
        location.translatedDescription || null,
        location.translationLanguage || null,
      ],
    )
  }

  async setCurrentLocation(storyId: string, locationId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE locations SET current = 0 WHERE story_id = ?', [storyId])
    await db.execute('UPDATE locations SET current = 1, visited = 1 WHERE id = ?', [locationId])
  }

  async updateLocation(id: string, updates: Partial<Location>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.visited !== undefined) {
      setClauses.push('visited = ?')
      values.push(updates.visited ? 1 : 0)
    }
    if (updates.current !== undefined) {
      setClauses.push('current = ?')
      values.push(updates.current ? 1 : 0)
    }
    if (updates.connections !== undefined) {
      setClauses.push('connections = ?')
      values.push(JSON.stringify(updates.connections))
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      values.push(JSON.stringify(updates.metadata))
    }
    // Translation fields
    if (updates.translatedName !== undefined) {
      setClauses.push('translated_name = ?')
      values.push(updates.translatedName || null)
    }
    if (updates.translatedDescription !== undefined) {
      setClauses.push('translated_description = ?')
      values.push(updates.translatedDescription || null)
    }
    if (updates.translationLanguage !== undefined) {
      setClauses.push('translation_language = ?')
      values.push(updates.translationLanguage || null)
    }

    if (setClauses.length === 0) return
    values.push(id)
    await db.execute(`UPDATE locations SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteLocation(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM locations WHERE id = ?', [id])
  }

  // Item operations
  async getItems(storyId: string): Promise<Item[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM items WHERE story_id = ?', [storyId])
    return results.map(this.mapItem)
  }

  /**
   * Get items filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getItemsForBranch(storyId: string, branchId: string | null): Promise<Item[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM items WHERE story_id = ? AND branch_id IS NULL'
        : 'SELECT * FROM items WHERE story_id = ? AND branch_id = ?',
      branchId === null ? [storyId] : [storyId, branchId],
    )
    return results.map(this.mapItem)
  }

  async addItem(item: Item): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO items (id, story_id, name, description, quantity, equipped, location, metadata, branch_id, overrides_id, deleted, owner_character_id, slot_key, container_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.storyId,
        item.name,
        item.description,
        item.quantity,
        item.equipped ? 1 : 0,
        item.location,
        item.metadata ? JSON.stringify(item.metadata) : null,
        item.branchId || null,
        item.overridesId || null,
        item.deleted ? 1 : 0,
        item.ownerCharacterId ?? null,
        item.slotKey ?? null,
        item.containerItemId ?? null,
      ],
    )
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.quantity !== undefined) {
      setClauses.push('quantity = ?')
      values.push(updates.quantity)
    }
    if (updates.weight !== undefined) {
      setClauses.push('weight = ?')
      values.push(updates.weight)
    }
    if (updates.equipped !== undefined) {
      setClauses.push('equipped = ?')
      values.push(updates.equipped ? 1 : 0)
    }
    if (updates.location !== undefined) {
      setClauses.push('location = ?')
      values.push(updates.location)
    }
    if (updates.ownerCharacterId !== undefined) {
      setClauses.push('owner_character_id = ?')
      values.push(updates.ownerCharacterId || null)
    }
    if (updates.slotKey !== undefined) {
      setClauses.push('slot_key = ?')
      values.push(updates.slotKey || null)
    }
    if (updates.containerItemId !== undefined) {
      setClauses.push('container_item_id = ?')
      values.push(updates.containerItemId || null)
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      values.push(JSON.stringify(updates.metadata))
    }
    // Translation fields
    if (updates.translatedName !== undefined) {
      setClauses.push('translated_name = ?')
      values.push(updates.translatedName || null)
    }
    if (updates.translatedDescription !== undefined) {
      setClauses.push('translated_description = ?')
      values.push(updates.translatedDescription || null)
    }
    if (updates.translationLanguage !== undefined) {
      setClauses.push('translation_language = ?')
      values.push(updates.translationLanguage || null)
    }

    if (setClauses.length === 0) return
    values.push(id)
    await db.execute(`UPDATE items SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteItem(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM items WHERE id = ?', [id])
  }

  async updateStoryBeat(id: string, updates: Partial<StoryBeat>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.type !== undefined) {
      setClauses.push('type = ?')
      values.push(updates.type)
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      values.push(updates.status)
    }
    if (updates.triggeredAt !== undefined) {
      setClauses.push('triggered_at = ?')
      values.push(updates.triggeredAt)
    }
    if (updates.resolvedAt !== undefined) {
      setClauses.push('resolved_at = ?')
      values.push(updates.resolvedAt)
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      values.push(JSON.stringify(updates.metadata))
    }
    // Translation fields
    if (updates.translatedTitle !== undefined) {
      setClauses.push('translated_title = ?')
      values.push(updates.translatedTitle || null)
    }
    if (updates.translatedDescription !== undefined) {
      setClauses.push('translated_description = ?')
      values.push(updates.translatedDescription || null)
    }
    if (updates.translationLanguage !== undefined) {
      setClauses.push('translation_language = ?')
      values.push(updates.translationLanguage || null)
    }

    if (setClauses.length === 0) return
    values.push(id)
    await db.execute(`UPDATE story_beats SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  // Story beats operations
  async getStoryBeats(storyId: string): Promise<StoryBeat[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM story_beats WHERE story_id = ?', [
      storyId,
    ])
    return results.map(this.mapStoryBeat)
  }

  /**
   * Get story beats filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getStoryBeatsForBranch(storyId: string, branchId: string | null): Promise<StoryBeat[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM story_beats WHERE story_id = ? AND branch_id IS NULL'
        : 'SELECT * FROM story_beats WHERE story_id = ? AND branch_id = ?',
      branchId === null ? [storyId] : [storyId, branchId],
    )
    return results.map(this.mapStoryBeat)
  }

  async addStoryBeat(beat: StoryBeat): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO story_beats (id, story_id, title, description, type, status, triggered_at, resolved_at, metadata, branch_id, overrides_id, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        beat.id,
        beat.storyId,
        beat.title,
        beat.description,
        beat.type,
        beat.status,
        beat.triggeredAt,
        beat.resolvedAt ?? null,
        beat.metadata ? JSON.stringify(beat.metadata) : null,
        beat.branchId || null,
        beat.overridesId || null,
        beat.deleted ? 1 : 0,
      ],
    )
  }

  async deleteStoryBeat(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM story_beats WHERE id = ?', [id])
  }

  // Chapter operations
  async getChapters(storyId: string): Promise<Chapter[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM chapters WHERE story_id = ? ORDER BY number ASC',
      [storyId],
    )
    return results.map(this.mapChapter)
  }

  /**
   * Get chapters filtered by branch.
   * @param storyId - The story ID
   * @param branchId - The branch ID (null for main branch chapters)
   */
  async getChaptersForBranch(storyId: string, branchId: string | null): Promise<Chapter[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM chapters WHERE story_id = ? AND branch_id IS NULL ORDER BY number ASC'
        : 'SELECT * FROM chapters WHERE story_id = ? AND branch_id = ? ORDER BY number ASC',
      branchId === null ? [storyId] : [storyId, branchId],
    )
    return results.map(this.mapChapter)
  }

  async getChapterSources(storyId: string): Promise<ChapterSource[]> {
    const db = await this.getDb()
    await this.ensureChapterSourcesTable(db)
    const results = await db.select<any[]>(
      'SELECT * FROM chapter_sources WHERE story_id = ? ORDER BY COALESCE(chapter_number, 2147483647), created_at ASC',
      [storyId],
    )
    return results.map(this.mapChapterSource)
  }

  async searchChapterSources(
    storyId: string,
    query: string,
    limit: number = 20,
  ): Promise<ChapterSource[]> {
    const db = await this.getDb()
    await this.ensureChapterSourcesTable(db)

    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return []

    const sources = await this.getChapterSources(storyId)
    return sources
      .filter((source) => {
        const haystack = [source.title, source.sourceFilename ?? '', source.rawText]
          .join('\n')
          .toLowerCase()
        return haystack.includes(trimmed)
      })
      .slice(0, limit)
  }

  async addChapterSource(source: ChapterSource): Promise<void> {
    const db = await this.getDb()
    await this.ensureChapterSourcesTable(db)
    await db.execute(
      `INSERT INTO chapter_sources (
        id, story_id, branch_id, title, source_filename, chapter_number, raw_text,
        summary, keywords, characters, locations, plot_threads, emotional_tone,
        source_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        source.id,
        source.storyId,
        source.branchId,
        source.title,
        source.sourceFilename,
        source.chapterNumber,
        source.rawText,
        source.summary,
        JSON.stringify(source.keywords),
        JSON.stringify(source.characters),
        JSON.stringify(source.locations),
        JSON.stringify(source.plotThreads),
        source.emotionalTone,
        source.sourceType,
        source.createdAt,
        source.updatedAt,
      ],
    )
  }

  async getChapter(id: string): Promise<Chapter | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM chapters WHERE id = ?', [id])
    return results.length > 0 ? this.mapChapter(results[0]) : null
  }

  async getNextChapterNumber(storyId: string): Promise<number> {
    const db = await this.getDb()
    const result = await db.select<{ maxNum: number | null }[]>(
      'SELECT MAX(number) as maxNum FROM chapters WHERE story_id = ?',
      [storyId],
    )
    return (result[0]?.maxNum ?? 0) + 1
  }

  async addChapter(chapter: Chapter): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO chapters (
        id, story_id, number, title, start_entry_id, end_entry_id, entry_count,
        summary, start_time, end_time, keywords, characters, locations, plot_threads, emotional_tone,
        branch_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chapter.id,
        chapter.storyId,
        chapter.number,
        chapter.title,
        chapter.startEntryId,
        chapter.endEntryId,
        chapter.entryCount,
        chapter.summary,
        chapter.startTime ? JSON.stringify(chapter.startTime) : null,
        chapter.endTime ? JSON.stringify(chapter.endTime) : null,
        JSON.stringify(chapter.keywords),
        JSON.stringify(chapter.characters),
        JSON.stringify(chapter.locations),
        JSON.stringify(chapter.plotThreads),
        chapter.emotionalTone,
        chapter.branchId || null,
        chapter.createdAt,
      ],
    )
  }

  async updateChapter(id: string, updates: Partial<Chapter>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.summary !== undefined) {
      setClauses.push('summary = ?')
      values.push(updates.summary)
    }
    if (updates.startTime !== undefined) {
      setClauses.push('start_time = ?')
      values.push(updates.startTime ? JSON.stringify(updates.startTime) : null)
    }
    if (updates.endTime !== undefined) {
      setClauses.push('end_time = ?')
      values.push(updates.endTime ? JSON.stringify(updates.endTime) : null)
    }
    if (updates.keywords !== undefined) {
      setClauses.push('keywords = ?')
      values.push(JSON.stringify(updates.keywords))
    }
    if (updates.characters !== undefined) {
      setClauses.push('characters = ?')
      values.push(JSON.stringify(updates.characters))
    }
    if (updates.locations !== undefined) {
      setClauses.push('locations = ?')
      values.push(JSON.stringify(updates.locations))
    }
    if (updates.plotThreads !== undefined) {
      setClauses.push('plot_threads = ?')
      values.push(JSON.stringify(updates.plotThreads))
    }
    if (updates.emotionalTone !== undefined) {
      setClauses.push('emotional_tone = ?')
      values.push(updates.emotionalTone)
    }

    if (setClauses.length === 0) return
    values.push(id)
    await db.execute(`UPDATE chapters SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteChapter(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM chapters WHERE id = ?', [id])
  }

  // Checkpoint operations
  async getCheckpoints(storyId: string): Promise<Checkpoint[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM checkpoints WHERE story_id = ? ORDER BY created_at DESC',
      [storyId],
    )
    return results.map(this.mapCheckpoint)
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM checkpoints WHERE id = ?', [id])
    return results.length > 0 ? this.mapCheckpoint(results[0]) : null
  }

  async createCheckpoint(checkpoint: Checkpoint): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO checkpoints (
        id, story_id, name, last_entry_id, last_entry_preview, entry_count,
        entries_snapshot, characters_snapshot, locations_snapshot,
        items_snapshot, story_beats_snapshot, chapters_snapshot, time_tracker_snapshot,
        lorebook_entries_snapshot, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        checkpoint.id,
        checkpoint.storyId,
        checkpoint.name,
        checkpoint.lastEntryId,
        checkpoint.lastEntryPreview,
        checkpoint.entryCount,
        JSON.stringify(checkpoint.entriesSnapshot),
        JSON.stringify(checkpoint.charactersSnapshot),
        JSON.stringify(checkpoint.locationsSnapshot),
        JSON.stringify(checkpoint.itemsSnapshot),
        JSON.stringify(checkpoint.storyBeatsSnapshot),
        JSON.stringify(checkpoint.chaptersSnapshot),
        checkpoint.timeTrackerSnapshot ? JSON.stringify(checkpoint.timeTrackerSnapshot) : null,
        checkpoint.lorebookEntriesSnapshot
          ? JSON.stringify(checkpoint.lorebookEntriesSnapshot)
          : null,
        checkpoint.createdAt,
      ],
    )
  }

  async deleteCheckpoint(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM checkpoints WHERE id = ?', [id])
  }

  /**
   * @deprecated This method is no longer used. Checkpoint restoration has been
   * replaced with branching to prevent data loss issues. Use createBranchFromCheckpoint
   * in the story store instead.
   */
  async restoreCheckpoint(checkpoint: Checkpoint, branchId: string | null): Promise<void> {
    const db = await this.getDb()
    const storyId = checkpoint.storyId

    const branchClause = branchId === null ? 'branch_id IS NULL' : 'branch_id = ?'
    const branchParams = branchId === null ? [] : [branchId]

    // Delete current state
    await db.execute(`DELETE FROM story_entries WHERE story_id = ? AND ${branchClause}`, [
      storyId,
      ...branchParams,
    ])
    await db.execute(`DELETE FROM characters WHERE story_id = ? AND ${branchClause}`, [
      storyId,
      ...branchParams,
    ])
    await db.execute(`DELETE FROM locations WHERE story_id = ? AND ${branchClause}`, [
      storyId,
      ...branchParams,
    ])
    await db.execute(`DELETE FROM items WHERE story_id = ? AND ${branchClause}`, [
      storyId,
      ...branchParams,
    ])
    await db.execute(`DELETE FROM story_beats WHERE story_id = ? AND ${branchClause}`, [
      storyId,
      ...branchParams,
    ])
    await db.execute(`DELETE FROM chapters WHERE story_id = ? AND ${branchClause}`, [
      storyId,
      ...branchParams,
    ])
    // Also delete lorebook entries if we have a snapshot to restore
    if (checkpoint.lorebookEntriesSnapshot !== undefined) {
      await db.execute(`DELETE FROM entries WHERE story_id = ? AND ${branchClause}`, [
        storyId,
        ...branchParams,
      ])
    }

    const matchesBranch = (entryBranchId: string | null | undefined) =>
      (entryBranchId ?? null) === branchId

    // Restore entries
    for (const entry of checkpoint.entriesSnapshot.filter((e) => matchesBranch(e.branchId))) {
      await this.addStoryEntry(entry)
    }

    // Restore characters
    for (const character of checkpoint.charactersSnapshot.filter((c) =>
      matchesBranch(c.branchId),
    )) {
      await this.addCharacter(character)
    }

    // Restore locations
    for (const location of checkpoint.locationsSnapshot.filter((l) => matchesBranch(l.branchId))) {
      await this.addLocation(location)
    }

    // Restore items
    for (const item of checkpoint.itemsSnapshot.filter((i) => matchesBranch(i.branchId))) {
      await this.addItem(item)
    }

    // Restore story beats
    for (const beat of checkpoint.storyBeatsSnapshot.filter((b) => matchesBranch(b.branchId))) {
      await this.addStoryBeat(beat)
    }

    // Restore chapters
    for (const chapter of checkpoint.chaptersSnapshot.filter((ch) => matchesBranch(ch.branchId))) {
      await this.addChapter(chapter)
    }

    // Restore lorebook entries (if snapshot exists - for backwards compatibility)
    if (checkpoint.lorebookEntriesSnapshot) {
      for (const entry of checkpoint.lorebookEntriesSnapshot.filter((e) =>
        matchesBranch(e.branchId),
      )) {
        await this.addEntry(entry)
      }
    }
  }

  // ===== World State Snapshots (Phase 1) =====

  async createWorldStateSnapshot(snapshot: WorldStateSnapshot): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO world_state_snapshots (
        id, story_id, branch_id, entry_id, entry_position,
        characters_snapshot, locations_snapshot, items_snapshot,
        story_beats_snapshot, lorebook_entries_snapshot, time_tracker_snapshot,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshot.id,
        snapshot.storyId,
        snapshot.branchId ?? null,
        snapshot.entryId,
        snapshot.entryPosition,
        JSON.stringify(snapshot.charactersSnapshot),
        JSON.stringify(snapshot.locationsSnapshot),
        JSON.stringify(snapshot.itemsSnapshot),
        JSON.stringify(snapshot.storyBeatsSnapshot),
        snapshot.lorebookEntriesSnapshot ? JSON.stringify(snapshot.lorebookEntriesSnapshot) : null,
        snapshot.timeTrackerSnapshot ? JSON.stringify(snapshot.timeTrackerSnapshot) : null,
        snapshot.createdAt,
      ],
    )
  }

  async getWorldStateSnapshots(
    storyId: string,
    branchId: string | null,
  ): Promise<WorldStateSnapshot[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM world_state_snapshots WHERE story_id = ? AND branch_id IS NULL ORDER BY entry_position ASC'
        : 'SELECT * FROM world_state_snapshots WHERE story_id = ? AND branch_id = ? ORDER BY entry_position ASC',
      branchId === null ? [storyId] : [storyId, branchId],
    )
    return results.map(this.mapWorldStateSnapshot)
  }

  async getLatestSnapshotBefore(
    storyId: string,
    branchId: string | null,
    position: number,
  ): Promise<WorldStateSnapshot | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM world_state_snapshots WHERE story_id = ? AND branch_id IS NULL AND entry_position <= ? ORDER BY entry_position DESC LIMIT 1'
        : 'SELECT * FROM world_state_snapshots WHERE story_id = ? AND branch_id = ? AND entry_position <= ? ORDER BY entry_position DESC LIMIT 1',
      branchId === null ? [storyId, position] : [storyId, branchId, position],
    )
    return results.length > 0 ? this.mapWorldStateSnapshot(results[0]) : null
  }

  async deleteWorldStateSnapshotsAfter(
    storyId: string,
    branchId: string | null,
    position: number,
  ): Promise<void> {
    const db = await this.getDb()
    if (branchId === null) {
      await db.execute(
        'DELETE FROM world_state_snapshots WHERE story_id = ? AND branch_id IS NULL AND entry_position > ?',
        [storyId, position],
      )
    } else {
      await db.execute(
        'DELETE FROM world_state_snapshots WHERE story_id = ? AND branch_id = ? AND entry_position > ?',
        [storyId, branchId, position],
      )
    }
  }

  async deleteWorldStateSnapshotsForBranch(branchId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM world_state_snapshots WHERE branch_id = ?', [branchId])
  }

  async deleteWorldStateSnapshotsForStory(storyId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM world_state_snapshots WHERE story_id = ?', [storyId])
  }

  /**
   * Restore story state from a retry backup.
   * Similar to restoreCheckpoint but designed for the "retry last message" feature.
   * Does NOT touch chapters or lorebook entries (those are more permanent).
   */
  async restoreRetryBackup(
    entryIdsToDelete: string[],
    storyId: string,
    branchId: string | null,
    characters: Character[],
    locations: Location[],
    items: Item[],
    storyBeats: StoryBeat[],
  ): Promise<void> {
    const db = await this.getDb()

    // Delete current state (except chapters and lorebook entries which are more permanent)
    // Note: embedded_images will be cascade-deleted when story_entries are deleted
    if (entryIdsToDelete.length > 0) {
      await this.deleteStoryEntries(entryIdsToDelete)
    }
    // Branch-aware delete: only remove world state for the current branch
    const branchFilter = branchId === null ? 'AND branch_id IS NULL' : 'AND branch_id = ?'
    const branchParams = branchId === null ? [storyId] : [storyId, branchId]
    await db.execute(`DELETE FROM characters WHERE story_id = ? ${branchFilter}`, branchParams)
    await db.execute(`DELETE FROM locations WHERE story_id = ? ${branchFilter}`, branchParams)
    await db.execute(`DELETE FROM items WHERE story_id = ? ${branchFilter}`, branchParams)
    await db.execute(`DELETE FROM story_beats WHERE story_id = ? ${branchFilter}`, branchParams)

    // Restore entries not necessary as we are only deleting redundant entries since backup

    // Restore characters
    for (const character of characters) {
      await this.addCharacter(character)
    }

    // Restore locations
    for (const location of locations) {
      await this.addLocation(location)
    }

    // Restore items
    for (const item of items) {
      await this.addItem(item)
    }

    // Restore story beats
    for (const beat of storyBeats) {
      await this.addStoryBeat(beat)
    }

    // Restore embedded images
    /*     for (const image of embeddedImages) {
      await this.createEmbeddedImage({
        id: image.id,
        storyId: image.storyId,
        entryId: image.entryId,
        sourceText: image.sourceText,
        prompt: image.prompt,
        styleId: image.styleId,
        model: image.model,
        imageData: image.imageData,
        width: image.width,
        height: image.height,
        status: image.status,
        errorMessage: image.errorMessage,
      })
    } */
  }

  // ===== Branch Operations (for story branching/alternate timelines) =====

  async getBranches(storyId: string): Promise<Branch[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM branches WHERE story_id = ? ORDER BY created_at ASC',
      [storyId],
    )
    return results.map(this.mapBranch)
  }

  async getBranch(id: string): Promise<Branch | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM branches WHERE id = ?', [id])
    return results.length > 0 ? this.mapBranch(results[0]) : null
  }

  async addBranch(branch: Branch): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO branches (id, story_id, name, parent_branch_id, fork_entry_id, checkpoint_id, created_at, snapshot_complete)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branch.id,
        branch.storyId,
        branch.name,
        branch.parentBranchId ?? null,
        branch.forkEntryId,
        branch.checkpointId ?? null,
        branch.createdAt,
        branch.snapshotComplete ? 1 : 0,
      ],
    )
  }

  async updateBranch(
    id: string,
    updates: Partial<Pick<Branch, 'name' | 'checkpointId'>>,
  ): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.checkpointId !== undefined) {
      setClauses.push('checkpoint_id = ?')
      values.push(updates.checkpointId ?? null)
    }

    if (setClauses.length === 0) return
    values.push(id)
    await db.execute(`UPDATE branches SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteBranch(id: string): Promise<void> {
    const db = await this.getDb()
    // Delete story entries belonging to this branch
    await db.execute('DELETE FROM story_entries WHERE branch_id = ?', [id])
    // Delete chapters belonging to this branch
    await db.execute('DELETE FROM chapters WHERE branch_id = ?', [id])
    // Delete world state items belonging to this branch
    await db.execute('DELETE FROM characters WHERE branch_id = ?', [id])
    await db.execute('DELETE FROM locations WHERE branch_id = ?', [id])
    await db.execute('DELETE FROM items WHERE branch_id = ?', [id])
    await db.execute('DELETE FROM story_beats WHERE branch_id = ?', [id])
    await db.execute('DELETE FROM entries WHERE branch_id = ?', [id])
    // Delete the branch itself
    await db.execute('DELETE FROM branches WHERE id = ?', [id])
  }

  async setStoryCurrentBranch(storyId: string, branchId: string | null): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET current_branch_id = ?, updated_at = ? WHERE id = ?', [
      branchId,
      Date.now(),
      storyId,
    ])
  }

  private mapBranch(row: any): Branch {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      parentBranchId: row.parent_branch_id || null,
      forkEntryId: row.fork_entry_id,
      checkpointId: row.checkpoint_id || null,
      createdAt: row.created_at,
      snapshotComplete: row.snapshot_complete === 1,
    }
  }

  async setBranchSnapshotComplete(branchId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE branches SET snapshot_complete = 1 WHERE id = ?', [branchId])
  }

  // ===== Entry/Lorebook Operations (per design doc section 3.2) =====

  async getEntries(storyId: string): Promise<Entry[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM entries WHERE story_id = ? ORDER BY created_at ASC',
      [storyId],
    )
    return results.map(this.mapEntry)
  }

  /**
   * Get lorebook entries filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getEntriesForBranch(storyId: string, branchId: string | null): Promise<Entry[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM entries WHERE story_id = ? AND branch_id IS NULL ORDER BY created_at ASC'
        : 'SELECT * FROM entries WHERE story_id = ? AND branch_id = ? ORDER BY created_at ASC',
      branchId === null ? [storyId] : [storyId, branchId],
    )
    return results.map(this.mapEntry)
  }

  // ===== COW Branch Resolution Methods =====

  /**
   * Resolve characters for a COW branch using lineage.
   * Walks main entities → each ancestor branch → current branch,
   * merging by canonical ID (overridesId ?? id). Later entries override earlier.
   */
  async getCharactersResolved(
    storyId: string,
    branchLineage: { id: string }[],
  ): Promise<Character[]> {
    const resolved = new Map<string, Character>()
    const currentBranchId = branchLineage[branchLineage.length - 1]?.id

    // Load main entities — strip deleted flag so children always inherit them
    const mainEntities = await this.getCharactersForBranch(storyId, null)
    for (const entity of mainEntities) {
      const mapped = entity.deleted ? { ...entity, deleted: false } : entity
      resolved.set(entity.overridesId ?? entity.id, mapped)
    }

    // Overlay each branch in lineage order (root → current)
    for (const branch of branchLineage) {
      const branchEntities = await this.getCharactersForBranch(storyId, branch.id)
      for (const entity of branchEntities) {
        const canonicalId = entity.overridesId ?? entity.id
        if (entity.deleted) {
          if (branch.id === currentBranchId) {
            // Tombstone on current branch: remove from resolved view
            resolved.delete(canonicalId)
          } else {
            // Ancestor tombstone: preserve entity for further inheritance
            resolved.set(canonicalId, { ...entity, deleted: false })
          }
        } else {
          resolved.set(canonicalId, entity)
        }
      }
    }

    return Array.from(resolved.values())
  }

  /**
   * Resolve locations for a COW branch using lineage.
   */
  async getLocationsResolved(
    storyId: string,
    branchLineage: { id: string }[],
  ): Promise<Location[]> {
    const resolved = new Map<string, Location>()
    const currentBranchId = branchLineage[branchLineage.length - 1]?.id

    const mainEntities = await this.getLocationsForBranch(storyId, null)
    for (const entity of mainEntities) {
      const mapped = entity.deleted ? { ...entity, deleted: false } : entity
      resolved.set(entity.overridesId ?? entity.id, mapped)
    }

    for (const branch of branchLineage) {
      const branchEntities = await this.getLocationsForBranch(storyId, branch.id)
      for (const entity of branchEntities) {
        const canonicalId = entity.overridesId ?? entity.id
        if (entity.deleted) {
          if (branch.id === currentBranchId) {
            resolved.delete(canonicalId)
          } else {
            resolved.set(canonicalId, { ...entity, deleted: false })
          }
        } else {
          resolved.set(canonicalId, entity)
        }
      }
    }

    return Array.from(resolved.values())
  }

  /**
   * Resolve items for a COW branch using lineage.
   */
  async getItemsResolved(storyId: string, branchLineage: { id: string }[]): Promise<Item[]> {
    const resolved = new Map<string, Item>()
    const currentBranchId = branchLineage[branchLineage.length - 1]?.id

    const mainEntities = await this.getItemsForBranch(storyId, null)
    for (const entity of mainEntities) {
      const mapped = entity.deleted ? { ...entity, deleted: false } : entity
      resolved.set(entity.overridesId ?? entity.id, mapped)
    }

    for (const branch of branchLineage) {
      const branchEntities = await this.getItemsForBranch(storyId, branch.id)
      for (const entity of branchEntities) {
        const canonicalId = entity.overridesId ?? entity.id
        if (entity.deleted) {
          if (branch.id === currentBranchId) {
            resolved.delete(canonicalId)
          } else {
            resolved.set(canonicalId, { ...entity, deleted: false })
          }
        } else {
          resolved.set(canonicalId, entity)
        }
      }
    }

    return Array.from(resolved.values())
  }

  /**
   * Resolve story beats for a COW branch using lineage.
   */
  async getStoryBeatsResolved(
    storyId: string,
    branchLineage: { id: string }[],
  ): Promise<StoryBeat[]> {
    const resolved = new Map<string, StoryBeat>()
    const currentBranchId = branchLineage[branchLineage.length - 1]?.id

    const mainEntities = await this.getStoryBeatsForBranch(storyId, null)
    for (const entity of mainEntities) {
      const mapped = entity.deleted ? { ...entity, deleted: false } : entity
      resolved.set(entity.overridesId ?? entity.id, mapped)
    }

    for (const branch of branchLineage) {
      const branchEntities = await this.getStoryBeatsForBranch(storyId, branch.id)
      for (const entity of branchEntities) {
        const canonicalId = entity.overridesId ?? entity.id
        if (entity.deleted) {
          if (branch.id === currentBranchId) {
            resolved.delete(canonicalId)
          } else {
            resolved.set(canonicalId, { ...entity, deleted: false })
          }
        } else {
          resolved.set(canonicalId, entity)
        }
      }
    }

    return Array.from(resolved.values())
  }

  /**
   * Resolve lorebook entries for a COW branch using lineage.
   */
  async getLorebookEntriesResolved(
    storyId: string,
    branchLineage: { id: string }[],
  ): Promise<Entry[]> {
    const resolved = new Map<string, Entry>()
    const currentBranchId = branchLineage[branchLineage.length - 1]?.id

    const mainEntities = await this.getEntriesForBranch(storyId, null)
    for (const entity of mainEntities) {
      const mapped = entity.deleted ? { ...entity, deleted: false } : entity
      resolved.set(entity.overridesId ?? entity.id, mapped)
    }

    for (const branch of branchLineage) {
      const branchEntities = await this.getEntriesForBranch(storyId, branch.id)
      for (const entity of branchEntities) {
        const canonicalId = entity.overridesId ?? entity.id
        if (entity.deleted) {
          if (branch.id === currentBranchId) {
            resolved.delete(canonicalId)
          } else {
            resolved.set(canonicalId, { ...entity, deleted: false })
          }
        } else {
          resolved.set(canonicalId, entity)
        }
      }
    }

    return Array.from(resolved.values())
  }

  // ===== Copy-on-Delete (COD) Tombstone Methods =====

  /**
   * Mark an entity as deleted (tombstone) on a COW branch.
   * The entity must already be owned by the branch (via cowEnsure*).
   */
  async markCharacterDeleted(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE characters SET deleted = 1 WHERE id = ?', [id])
  }

  async markLocationDeleted(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE locations SET deleted = 1 WHERE id = ?', [id])
  }

  async markItemDeleted(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE items SET deleted = 1 WHERE id = ?', [id])
  }

  async markStoryBeatDeleted(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE story_beats SET deleted = 1 WHERE id = ?', [id])
  }

  async markEntryDeleted(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE entries SET deleted = 1 WHERE id = ?', [id])
  }

  /**
   * Remove no-op COW overrides — override rows whose data columns
   * are identical to the original they point to. Called after rollback
   * to clean up redundant rows.
   */
  async cleanupNoopOverrides(storyId: string, branchId: string | null): Promise<number> {
    const db = await this.getDb()
    let totalDeleted = 0

    // Characters: compare all data columns
    const charResult = await db.execute(
      `DELETE FROM characters WHERE id IN (
        SELECT o.id FROM characters o
        JOIN characters orig ON o.overrides_id = orig.id
        WHERE o.story_id = ? AND o.branch_id ${branchId === null ? 'IS NULL' : '= ?'}
          AND o.overrides_id IS NOT NULL
          AND o.deleted = 0
          AND IFNULL(o.name,'') = IFNULL(orig.name,'')
          AND IFNULL(o.description,'') = IFNULL(orig.description,'')
          AND IFNULL(o.relationship,'') = IFNULL(orig.relationship,'')
          AND IFNULL(o.traits,'') = IFNULL(orig.traits,'')
          AND IFNULL(o.status,'') = IFNULL(orig.status,'')
          AND IFNULL(o.metadata,'') = IFNULL(orig.metadata,'')
          AND IFNULL(o.visual_descriptors,'') = IFNULL(orig.visual_descriptors,'')
          AND IFNULL(o.portrait,'') = IFNULL(orig.portrait,'')
      )`,
      branchId === null ? [storyId] : [storyId, branchId],
    )
    totalDeleted += charResult.rowsAffected

    // Locations: compare all data columns
    const locResult = await db.execute(
      `DELETE FROM locations WHERE id IN (
        SELECT o.id FROM locations o
        JOIN locations orig ON o.overrides_id = orig.id
        WHERE o.story_id = ? AND o.branch_id ${branchId === null ? 'IS NULL' : '= ?'}
          AND o.overrides_id IS NOT NULL
          AND o.deleted = 0
          AND IFNULL(o.name,'') = IFNULL(orig.name,'')
          AND IFNULL(o.description,'') = IFNULL(orig.description,'')
          AND o.visited = orig.visited
          AND o.current = orig.current
          AND IFNULL(o.connections,'') = IFNULL(orig.connections,'')
          AND IFNULL(o.metadata,'') = IFNULL(orig.metadata,'')
      )`,
      branchId === null ? [storyId] : [storyId, branchId],
    )
    totalDeleted += locResult.rowsAffected

    // Items: compare all data columns
    const itemResult = await db.execute(
      `DELETE FROM items WHERE id IN (
        SELECT o.id FROM items o
        JOIN items orig ON o.overrides_id = orig.id
        WHERE o.story_id = ? AND o.branch_id ${branchId === null ? 'IS NULL' : '= ?'}
          AND o.overrides_id IS NOT NULL
          AND o.deleted = 0
          AND IFNULL(o.name,'') = IFNULL(orig.name,'')
          AND IFNULL(o.description,'') = IFNULL(orig.description,'')
          AND o.quantity = orig.quantity
          AND o.equipped = orig.equipped
          AND IFNULL(o.location,'') = IFNULL(orig.location,'')
          AND IFNULL(o.metadata,'') = IFNULL(orig.metadata,'')
      )`,
      branchId === null ? [storyId] : [storyId, branchId],
    )
    totalDeleted += itemResult.rowsAffected

    // Story Beats: compare all data columns
    const beatResult = await db.execute(
      `DELETE FROM story_beats WHERE id IN (
        SELECT o.id FROM story_beats o
        JOIN story_beats orig ON o.overrides_id = orig.id
        WHERE o.story_id = ? AND o.branch_id ${branchId === null ? 'IS NULL' : '= ?'}
          AND o.overrides_id IS NOT NULL
          AND o.deleted = 0
          AND IFNULL(o.title,'') = IFNULL(orig.title,'')
          AND IFNULL(o.description,'') = IFNULL(orig.description,'')
          AND IFNULL(o.type,'') = IFNULL(orig.type,'')
          AND IFNULL(o.status,'') = IFNULL(orig.status,'')
          AND IFNULL(o.triggered_at,0) = IFNULL(orig.triggered_at,0)
          AND IFNULL(o.resolved_at,0) = IFNULL(orig.resolved_at,0)
          AND IFNULL(o.metadata,'') = IFNULL(orig.metadata,'')
      )`,
      branchId === null ? [storyId] : [storyId, branchId],
    )
    totalDeleted += beatResult.rowsAffected

    if (totalDeleted > 0) {
      console.log(
        `[DatabaseService] Cleaned up ${totalDeleted} no-op COW override(s) for story ${storyId}`,
      )
    }

    return totalDeleted
  }

  async getEntriesByType(storyId: string, type: EntryType): Promise<Entry[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM entries WHERE story_id = ? AND type = ? ORDER BY created_at ASC',
      [storyId, type],
    )
    return results.map(this.mapEntry)
  }

  async getEntryPreviews(storyId: string): Promise<EntryPreview[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT id, name, type, description, aliases FROM entries WHERE story_id = ? ORDER BY name ASC',
      [storyId],
    )
    return results.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description || '',
      aliases: row.aliases ? JSON.parse(row.aliases) : [],
    }))
  }

  async getEntry(id: string): Promise<Entry | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM entries WHERE id = ?', [id])
    return results.length > 0 ? this.mapEntry(results[0]) : null
  }

  async bulkInsertEntries(entries: Entry[]): Promise<void> {
    if (entries.length === 0) return
    const db = await this.getDb()

    // Single INSERT statement = single atomic SQLite operation.
    // tauri-plugin-sql v2 exposes no JS transaction API and uses a sqlx connection
    // pool, so BEGIN/COMMIT across separate execute() calls is unsafe (different
    // pool connections). A single multi-row INSERT is atomically guaranteed by
    // SQLite itself. Modern SQLite (3.32+, bundled with sqlx) supports up to
    // 32,766 bind variables — at 21 params/row that's ~1,560 entries, well beyond
    // any realistic lorebook size.
    const valuePlaceholders = entries
      .map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .join(',')
    const values: unknown[] = []

    for (const entry of entries) {
      values.push(
        entry.id,
        entry.storyId,
        entry.name,
        entry.type,
        entry.description,
        entry.hiddenInfo,
        JSON.stringify(entry.aliases),
        JSON.stringify(entry.state),
        entry.adventureState ? JSON.stringify(entry.adventureState) : null,
        null, // creative_state: creative-writing mode removed
        JSON.stringify(entry.injection),
        entry.firstMentioned,
        entry.lastMentioned,
        entry.mentionCount,
        entry.createdBy,
        entry.createdAt,
        entry.updatedAt,
        entry.loreManagementBlacklisted ? 1 : 0,
        entry.branchId || null,
        entry.overridesId || null,
        entry.deleted ? 1 : 0,
      )
    }

    await db.execute(
      `INSERT INTO entries (
        id, story_id, name, type, description, hidden_info, aliases,
        state, adventure_state, creative_state, injection,
        first_mentioned, last_mentioned, mention_count, created_by,
        created_at, updated_at, lore_management_blacklisted, branch_id, overrides_id, deleted
      ) VALUES ${valuePlaceholders}`,
      values,
    )
  }

  async addEntry(entry: Entry): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO entries (
        id, story_id, name, type, description, hidden_info, aliases,
        state, adventure_state, creative_state, injection,
        first_mentioned, last_mentioned, mention_count, created_by,
        created_at, updated_at, lore_management_blacklisted, branch_id, overrides_id, deleted, ability_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.storyId,
        entry.name,
        entry.type,
        entry.description,
        entry.hiddenInfo,
        JSON.stringify(entry.aliases),
        JSON.stringify(entry.state),
        entry.adventureState ? JSON.stringify(entry.adventureState) : null,
        null, // creative_state: creative-writing mode removed
        JSON.stringify(entry.injection),
        entry.firstMentioned,
        entry.lastMentioned,
        entry.mentionCount,
        entry.createdBy,
        entry.createdAt,
        entry.updatedAt,
        entry.loreManagementBlacklisted ? 1 : 0,
        entry.branchId || null,
        entry.overridesId || null,
        entry.deleted ? 1 : 0,
        entry.abilityId ?? null,
      ],
    )
  }

  async updateEntry(id: string, updates: Partial<Entry>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.type !== undefined) {
      setClauses.push('type = ?')
      values.push(updates.type)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.abilityId !== undefined) {
      setClauses.push('ability_id = ?')
      values.push(updates.abilityId ?? null)
    }
    if (updates.hiddenInfo !== undefined) {
      setClauses.push('hidden_info = ?')
      values.push(updates.hiddenInfo)
    }
    if (updates.aliases !== undefined) {
      setClauses.push('aliases = ?')
      values.push(JSON.stringify(updates.aliases))
    }
    if (updates.state !== undefined) {
      setClauses.push('state = ?')
      values.push(JSON.stringify(updates.state))
    }
    if (updates.adventureState !== undefined) {
      setClauses.push('adventure_state = ?')
      values.push(updates.adventureState ? JSON.stringify(updates.adventureState) : null)
    }
    if (updates.injection !== undefined) {
      setClauses.push('injection = ?')
      values.push(JSON.stringify(updates.injection))
    }
    if (updates.firstMentioned !== undefined) {
      setClauses.push('first_mentioned = ?')
      values.push(updates.firstMentioned)
    }
    if (updates.lastMentioned !== undefined) {
      setClauses.push('last_mentioned = ?')
      values.push(updates.lastMentioned)
    }
    if (updates.mentionCount !== undefined) {
      setClauses.push('mention_count = ?')
      values.push(updates.mentionCount)
    }
    if (updates.loreManagementBlacklisted !== undefined) {
      setClauses.push('lore_management_blacklisted = ?')
      values.push(updates.loreManagementBlacklisted ? 1 : 0)
    }

    values.push(id)
    await db.execute(`UPDATE entries SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteEntry(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM entries WHERE id = ?', [id])
  }

  async mergeEntries(entryIds: string[], mergedEntry: Entry): Promise<void> {
    // Delete old entries
    for (const id of entryIds) {
      await this.deleteEntry(id)
    }

    // Add merged entry
    await this.addEntry(mergedEntry)
  }

  async searchEntries(storyId: string, query: string): Promise<Entry[]> {
    const db = await this.getDb()
    const searchPattern = `%${query}%`
    const results = await db.select<any[]>(
      `SELECT * FROM entries WHERE story_id = ? AND (
        name LIKE ? OR description LIKE ? OR aliases LIKE ?
      ) ORDER BY name ASC`,
      [storyId, searchPattern, searchPattern, searchPattern],
    )
    return results.map(this.mapEntry)
  }

  // ===== Epistemic Secret System (Phase B) =====

  async getSecretAtomsForStory(storyId: string): Promise<EpistemicSecretAtom[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM epistemic_secret_atoms WHERE story_id = ? ORDER BY created_at ASC',
      [storyId],
    )
    return results.map(this.mapEpistemicSecretAtom)
  }

  async getSecretAtomsByParentEntry(
    storyId: string,
    parentEntryId: string,
  ): Promise<EpistemicSecretAtom[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM epistemic_secret_atoms WHERE story_id = ? AND parent_entry_id = ? ORDER BY created_at ASC',
      [storyId, parentEntryId],
    )
    return results.map(this.mapEpistemicSecretAtom)
  }

  async getSecretAtom(id: string): Promise<EpistemicSecretAtom | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM epistemic_secret_atoms WHERE id = ?', [
      id,
    ])
    return results.length > 0 ? this.mapEpistemicSecretAtom(results[0]) : null
  }

  async addSecretAtom(atom: EpistemicSecretAtom): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO epistemic_secret_atoms (
        id, story_id, parent_entry_id, label, payload_hidden, payload_foreshadow,
        secrecy_scope, reveal_state, reveal_constraints, provenance, visibility_scope,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        atom.id,
        atom.storyId,
        atom.parentEntryId,
        atom.label,
        atom.payloadHidden,
        atom.payloadForeshadow,
        atom.secrecyScope,
        atom.revealState,
        atom.revealConstraints ? JSON.stringify(atom.revealConstraints) : null,
        atom.provenance ? JSON.stringify(atom.provenance) : null,
        atom.visibilityScope,
        atom.createdAt,
        atom.updatedAt,
      ],
    )
  }

  async updateSecretAtom(id: string, updates: Partial<EpistemicSecretAtom>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (updates.parentEntryId !== undefined) {
      setClauses.push('parent_entry_id = ?')
      values.push(updates.parentEntryId)
    }
    if (updates.label !== undefined) {
      setClauses.push('label = ?')
      values.push(updates.label)
    }
    if (updates.payloadHidden !== undefined) {
      setClauses.push('payload_hidden = ?')
      values.push(updates.payloadHidden)
    }
    if (updates.payloadForeshadow !== undefined) {
      setClauses.push('payload_foreshadow = ?')
      values.push(updates.payloadForeshadow)
    }
    if (updates.secrecyScope !== undefined) {
      setClauses.push('secrecy_scope = ?')
      values.push(updates.secrecyScope)
    }
    if (updates.revealState !== undefined) {
      setClauses.push('reveal_state = ?')
      values.push(updates.revealState)
    }
    if (updates.revealConstraints !== undefined) {
      setClauses.push('reveal_constraints = ?')
      values.push(updates.revealConstraints ? JSON.stringify(updates.revealConstraints) : null)
    }
    if (updates.provenance !== undefined) {
      setClauses.push('provenance = ?')
      values.push(updates.provenance ? JSON.stringify(updates.provenance) : null)
    }
    if (updates.visibilityScope !== undefined) {
      setClauses.push('visibility_scope = ?')
      values.push(updates.visibilityScope)
    }

    values.push(id)
    await db.execute(
      `UPDATE epistemic_secret_atoms SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    )
  }

  async deleteSecretAtom(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM epistemic_secret_atoms WHERE id = ?', [id])
  }

  async getKnowledgeEdgesForStory(storyId: string): Promise<EpistemicCharacterKnowledgeEdge[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM epistemic_character_knowledge_edges WHERE story_id = ? ORDER BY updated_at DESC',
      [storyId],
    )
    return results.map(this.mapEpistemicCharacterKnowledgeEdge)
  }

  async getKnowledgeEdgesForAtom(
    storyId: string,
    atomId: string,
  ): Promise<EpistemicCharacterKnowledgeEdge[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM epistemic_character_knowledge_edges WHERE story_id = ? AND atom_id = ? ORDER BY updated_at DESC',
      [storyId, atomId],
    )
    return results.map(this.mapEpistemicCharacterKnowledgeEdge)
  }

  async getKnowledgeEdgesForCharacterRef(
    storyId: string,
    characterRefType: EpistemicCharacterRefType,
    characterRefId: string,
  ): Promise<EpistemicCharacterKnowledgeEdge[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      `SELECT * FROM epistemic_character_knowledge_edges
       WHERE story_id = ? AND character_ref_type = ? AND character_ref_id = ?
       ORDER BY updated_at DESC`,
      [storyId, characterRefType, characterRefId],
    )
    return results.map(this.mapEpistemicCharacterKnowledgeEdge)
  }

  async upsertKnowledgeEdge(edge: EpistemicCharacterKnowledgeEdge): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO epistemic_character_knowledge_edges (
        id, story_id, atom_id, character_ref_type, character_ref_id, character_id,
        knows, confidence, disclosure_intent, disclosure_policy,
        rationale_tags, pressure_tags, learned_via, learned_at, metadata, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(story_id, atom_id, character_ref_type, character_ref_id)
      DO UPDATE SET
        character_id = excluded.character_id,
        knows = excluded.knows,
        confidence = excluded.confidence,
        disclosure_intent = excluded.disclosure_intent,
        disclosure_policy = excluded.disclosure_policy,
        rationale_tags = excluded.rationale_tags,
        pressure_tags = excluded.pressure_tags,
        learned_via = excluded.learned_via,
        learned_at = excluded.learned_at,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at`,
      [
        edge.id,
        edge.storyId,
        edge.atomId,
        edge.characterRefType,
        edge.characterRefId,
        edge.characterId,
        edge.knows ? 1 : 0,
        edge.confidence,
        edge.disclosureIntent,
        edge.disclosurePolicy,
        JSON.stringify(edge.rationaleTags),
        JSON.stringify(edge.pressureTags),
        edge.learnedVia,
        edge.learnedAt,
        edge.metadata ? JSON.stringify(edge.metadata) : null,
        edge.updatedAt,
      ],
    )
  }

  async deleteKnowledgeEdge(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM epistemic_character_knowledge_edges WHERE id = ?', [id])
  }

  async reconcileKnowledgeEdgesToCanonicalCharacter(
    storyId: string,
    characterId: string,
    refs: EpistemicIdentityRef[],
  ): Promise<number> {
    const dedupedRefs = Array.from(
      new Map(
        refs
          .filter((ref) => !!ref.refId && ref.refType !== 'story_character')
          .map((ref) => [`${ref.refType}:${ref.refId}`, ref]),
      ).values(),
    )

    if (dedupedRefs.length === 0) return 0

    const allEdges: EpistemicCharacterKnowledgeEdge[] = await this.getKnowledgeEdgesForCharacterRef(
      storyId,
      'story_character',
      characterId,
    )

    for (const ref of dedupedRefs) {
      const refEdges = await this.getKnowledgeEdgesForCharacterRef(storyId, ref.refType, ref.refId)
      allEdges.push(...refEdges)
    }

    if (allEdges.length === 0) return 0

    const groupedByAtom = new Map<string, EpistemicCharacterKnowledgeEdge[]>()
    for (const edge of allEdges) {
      const bucket = groupedByAtom.get(edge.atomId) ?? []
      bucket.push(edge)
      groupedByAtom.set(edge.atomId, bucket)
    }

    let removedTypedEdges = 0
    const now = Date.now()
    const policyRank: Record<string, number> = {
      guarded: 0,
      selective: 1,
      manipulative: 2,
      candid: 3,
    }

    for (const [atomId, edges] of groupedByAtom) {
      const sortedByRecency = [...edges].sort((a, b) => b.updatedAt - a.updatedAt)
      const canonicalExisting = edges.find(
        (edge) =>
          edge.characterRefType === 'story_character' && edge.characterRefId === characterId,
      )

      const strongestPressureTags = new Map<
        string,
        EpistemicCharacterKnowledgeEdge['pressureTags'][number]
      >()
      for (const edge of edges) {
        for (const tag of edge.pressureTags) {
          const key = `${tag.type}:${tag.tag}`
          const existing = strongestPressureTags.get(key)
          if (!existing || Math.abs(tag.strength) > Math.abs(existing.strength)) {
            strongestPressureTags.set(key, tag)
          }
        }
      }

      const mergedEdge: EpistemicCharacterKnowledgeEdge = {
        id: canonicalExisting?.id ?? crypto.randomUUID(),
        storyId,
        atomId,
        characterRefType: 'story_character',
        characterRefId: characterId,
        characterId,
        knows: edges.some((edge) => edge.knows),
        confidence: Math.max(...edges.map((edge) => edge.confidence ?? 0)),
        disclosureIntent: sortedByRecency[0]?.disclosureIntent ?? 0,
        disclosurePolicy:
          [...edges].sort(
            (a, b) =>
              (policyRank[a.disclosurePolicy] ?? Number.MAX_SAFE_INTEGER) -
              (policyRank[b.disclosurePolicy] ?? Number.MAX_SAFE_INTEGER),
          )[0]?.disclosurePolicy ?? 'guarded',
        rationaleTags: Array.from(new Set(edges.flatMap((edge) => edge.rationaleTags))),
        pressureTags: Array.from(strongestPressureTags.values()),
        learnedVia: sortedByRecency.find((edge) => edge.learnedVia)?.learnedVia ?? null,
        learnedAt:
          edges
            .map((edge) => edge.learnedAt)
            .filter((value): value is number => typeof value === 'number')
            .sort((a, b) => a - b)[0] ?? null,
        metadata: {
          ...(canonicalExisting?.metadata ?? {}),
          mergedFrom: edges
            .filter(
              (edge) =>
                !(
                  edge.characterRefType === 'story_character' && edge.characterRefId === characterId
                ),
            )
            .map((edge) => ({
              id: edge.id,
              refType: edge.characterRefType,
              refId: edge.characterRefId,
            })),
          mergeTimestamp: now,
        },
        updatedAt: now,
      }

      await this.upsertKnowledgeEdge(mergedEdge)

      for (const edge of edges) {
        const isCanonicalTarget =
          edge.characterRefType === 'story_character' && edge.characterRefId === characterId
        if (!isCanonicalTarget) {
          await this.deleteKnowledgeEdge(edge.id)
          removedTypedEdges += 1
        }
      }
    }

    return removedTypedEdges
  }

  async getDirectorProposalArtifacts(storyId: string): Promise<DirectorProposalArtifact[]> {
    const db = await this.getDb()
    await this.ensureDirectorProposalArtifactsTable(db)
    const results = await db.select<any[]>(
      'SELECT * FROM director_assistant_artifacts WHERE story_id = ? ORDER BY created_at DESC',
      [storyId],
    )
    return results.map(this.mapDirectorProposalArtifact)
  }

  async addDirectorProposalArtifact(artifact: DirectorProposalArtifact): Promise<void> {
    const db = await this.getDb()
    await this.ensureDirectorProposalArtifactsTable(db)
    await db.execute(
      `INSERT INTO director_assistant_artifacts (
        id, story_id, author_type, proposal_type, title, draft_payload,
        diff_payload, approval_state, approved_by, approved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        artifact.id,
        artifact.storyId,
        artifact.authorType,
        artifact.proposalType,
        artifact.title,
        JSON.stringify(artifact.draftPayload),
        artifact.diffPayload ? JSON.stringify(artifact.diffPayload) : null,
        artifact.approvalState,
        artifact.approvedBy,
        artifact.approvedAt,
        artifact.createdAt,
        artifact.updatedAt,
      ],
    )
  }

  async updateDirectorProposalArtifact(
    id: string,
    updates: Partial<DirectorProposalArtifact>,
  ): Promise<void> {
    const db = await this.getDb()
    await this.ensureDirectorProposalArtifactsTable(db)
    const setClauses: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (updates.authorType !== undefined) {
      setClauses.push('author_type = ?')
      values.push(updates.authorType)
    }
    if (updates.proposalType !== undefined) {
      setClauses.push('proposal_type = ?')
      values.push(updates.proposalType)
    }
    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.draftPayload !== undefined) {
      setClauses.push('draft_payload = ?')
      values.push(JSON.stringify(updates.draftPayload))
    }
    if (updates.diffPayload !== undefined) {
      setClauses.push('diff_payload = ?')
      values.push(updates.diffPayload ? JSON.stringify(updates.diffPayload) : null)
    }
    if (updates.approvalState !== undefined) {
      setClauses.push('approval_state = ?')
      values.push(updates.approvalState)
    }
    if (updates.approvedBy !== undefined) {
      setClauses.push('approved_by = ?')
      values.push(updates.approvedBy)
    }
    if (updates.approvedAt !== undefined) {
      setClauses.push('approved_at = ?')
      values.push(updates.approvedAt)
    }

    values.push(id)
    await db.execute(
      `UPDATE director_assistant_artifacts SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    )
  }

  async deleteDirectorProposalArtifact(id: string): Promise<void> {
    const db = await this.getDb()
    await this.ensureDirectorProposalArtifactsTable(db)
    await db.execute('DELETE FROM director_assistant_artifacts WHERE id = ?', [id])
  }

  // ===== Embedded Image Operations =====

  async getEmbeddedImagesForEntry(entryId: string): Promise<EmbeddedImage[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM embedded_images WHERE entry_id = ? ORDER BY created_at ASC',
      [entryId],
    )
    return results.map(this.mapEmbeddedImage)
  }

  async getEmbeddedImagesForStory(storyId: string): Promise<EmbeddedImage[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM embedded_images WHERE story_id = ? ORDER BY created_at ASC',
      [storyId],
    )
    return results.map(this.mapEmbeddedImage)
  }

  async createEmbeddedImage(image: Omit<EmbeddedImage, 'createdAt'>): Promise<EmbeddedImage> {
    const db = await this.getDb()
    const now = Date.now()
    await db.execute(
      `INSERT INTO embedded_images (
        id, story_id, entry_id, source_text, prompt, style_id, model,
        image_data, width, height, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        image.id,
        image.storyId,
        image.entryId,
        image.sourceText,
        image.prompt,
        image.styleId,
        image.model,
        image.imageData,
        image.width ?? null,
        image.height ?? null,
        image.status,
        image.errorMessage ?? null,
        now,
      ],
    )
    return { ...image, createdAt: now }
  }

  async getEmbeddedImage(id: string): Promise<EmbeddedImage | null> {
    const db = await this.getDb()
    const result = await db.select<any[]>('SELECT * FROM embedded_images WHERE id = ?', [id])
    return result.length > 0 ? this.mapEmbeddedImage(result[0]) : null
  }

  async updateEmbeddedImage(id: string, updates: Partial<EmbeddedImage>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.imageData !== undefined) {
      setClauses.push('image_data = ?')
      values.push(updates.imageData)
    }
    if (updates.width !== undefined) {
      setClauses.push('width = ?')
      values.push(updates.width)
    }
    if (updates.height !== undefined) {
      setClauses.push('height = ?')
      values.push(updates.height)
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      values.push(updates.status)
    }
    if (updates.errorMessage !== undefined) {
      setClauses.push('error_message = ?')
      values.push(updates.errorMessage)
    }
    if (updates.prompt !== undefined) {
      setClauses.push('prompt = ?')
      values.push(updates.prompt)
    }
    if (updates.model !== undefined) {
      setClauses.push('model = ?')
      values.push(updates.model)
    }
    if (updates.styleId !== undefined) {
      setClauses.push('style_id = ?')
      values.push(updates.styleId)
    }
    if (updates.sourceText !== undefined) {
      setClauses.push('source_text = ?')
      values.push(updates.sourceText)
    }

    if (setClauses.length === 0) return
    values.push(id)
    await db.execute(`UPDATE embedded_images SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteEmbeddedImage(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM embedded_images WHERE id = ?', [id])
  }

  async deleteEmbeddedImagesForEntry(entryId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM embedded_images WHERE entry_id = ?', [entryId])
  }

  /**
   * Get the background image for a specific branch.
   */
  async getBackgroundForBranch(storyId: string, branchId: string | null): Promise<string | null> {
    const db = await this.getDb()
    const results = await db.select<{ image_data: string }[]>(
      'SELECT image_data FROM background_images WHERE story_id = ? AND branch_id IS ? AND checkpoint_id IS NULL ORDER BY created_at DESC LIMIT 1',
      [storyId, branchId],
    )
    return results.length > 0 ? results[0].image_data : null
  }

  /**
   * Get the background image for a specific checkpoint.
   */
  async getBackgroundForCheckpoint(storyId: string, checkpointId: string): Promise<string | null> {
    const db = await this.getDb()
    const results = await db.select<{ image_data: string }[]>(
      'SELECT image_data FROM background_images WHERE story_id = ? AND checkpoint_id = ? LIMIT 1',
      [storyId, checkpointId],
    )
    return results.length > 0 ? results[0].image_data : null
  }

  /**
   * Save a background image for a story/branch/checkpoint.
   */
  async saveBackground(
    storyId: string,
    branchId: string | null,
    checkpointId: string | null,
    imageData: string | null,
  ): Promise<void> {
    const db = await this.getDb()

    if (!imageData) {
      // If clearing, delete entries for this specific context
      if (checkpointId) {
        await db.execute('DELETE FROM background_images WHERE story_id = ? AND checkpoint_id = ?', [
          storyId,
          checkpointId,
        ])
      } else {
        await db.execute(
          'DELETE FROM background_images WHERE story_id = ? AND branch_id IS ? AND checkpoint_id IS NULL',
          [storyId, branchId],
        )
      }
      return
    }

    // Insert or update
    const id = crypto.randomUUID()
    const now = Date.now()

    if (checkpointId) {
      // Checkpoints always get a new entry or replace existing for that checkpoint
      await db.execute(
        'INSERT OR REPLACE INTO background_images (id, story_id, branch_id, checkpoint_id, image_data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, storyId, branchId, checkpointId, imageData, now],
      )
    } else {
      // For branches (including main), we update the single "current" record for that branch
      const existing = await this.getBackgroundForBranch(storyId, branchId)
      if (existing) {
        await db.execute(
          'UPDATE background_images SET image_data = ?, created_at = ? WHERE story_id = ? AND branch_id IS ? AND checkpoint_id IS NULL',
          [imageData, now, storyId, branchId],
        )
      } else {
        await db.execute(
          'INSERT INTO background_images (id, story_id, branch_id, checkpoint_id, image_data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, storyId, branchId, null, imageData, now],
        )
      }
    }
  }

  /**
   * Clean up orphaned embedded_images that reference non-existent story_entries.
   * This can happen if data was created before foreign key constraints were enforced.
   * Returns the number of orphaned records deleted.
   */
  async cleanupOrphanedEmbeddedImages(): Promise<number> {
    const db = await this.getDb()
    // Find and delete embedded_images where the referenced entry_id doesn't exist
    const result = await db.execute(
      `DELETE FROM embedded_images
       WHERE entry_id NOT IN (SELECT id FROM story_entries)`,
    )
    const deleted = result.rowsAffected ?? 0
    if (deleted > 0) {
      console.log(`[Database] Cleaned up ${deleted} orphaned embedded_images`)
    }
    return deleted
  }

  private mapEmbeddedImage(row: any): EmbeddedImage {
    const sourceText = row.source_text
    // Detect inline images by checking if sourceText is a <pic> tag
    const isInline = sourceText && sourceText.trim().startsWith('<pic ')

    return {
      id: row.id,
      storyId: row.story_id,
      entryId: row.entry_id,
      sourceText: sourceText,
      prompt: row.prompt,
      styleId: row.style_id,
      model: row.model,
      imageData: row.image_data,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      status: row.status as EmbeddedImageStatus,
      errorMessage: row.error_message ?? undefined,
      generationMode: isInline ? 'inline' : 'analyzed',
      createdAt: row.created_at,
    }
  }

  // Mapping functions
  private mapCampaign(row: any): Campaign {
    return {
      id: row.id,
      storyId: row.story_id ?? null,
      title: row.title,
      description: row.description ?? null,
      rulesetId: row.ruleset_id ?? null,
      spotlightCharacterId: row.spotlight_character_id ?? null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapCampaignSettings(row: any): CampaignSettings {
    return {
      campaignId: row.campaign_id,
      defaultPartySize: row.default_party_size,
      maxPartySize: row.max_party_size,
      sceneMode: row.scene_mode,
      turnOrderMode: row.turn_order_mode,
      diceEnforcement: row.dice_enforcement,
      nsfwIntensity: row.nsfw_intensity,
      worldCharter: row.world_charter ?? null,
      gmPersona: row.gm_persona ?? null,
      companionCombatPolicy: row.companion_combat_policy ?? 'companions_autonomous',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapCampaignThread(row: any): CampaignThread {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      title: row.title,
      summary: row.summary ?? null,
      threadType: row.thread_type ?? 'plot',
      status: row.status ?? 'active',
      visibility: row.visibility ?? 'player_safe',
      priority: row.priority ?? 0,
      clockValue: row.clock_value ?? 0,
      clockMax: row.clock_max ?? null,
      stakes: row.stakes ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapCampaignThreadBeat(row: any): CampaignThreadBeat {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      threadId: row.thread_id,
      title: row.title,
      summary: row.summary ?? null,
      beatType: row.beat_type ?? 'note',
      visibility: row.visibility ?? 'player_safe',
      sortOrder: row.sort_order ?? 0,
      occurredAt: row.occurred_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapSceneTurnState(row: any): SceneTurnState {
    let actorOrder: string[] = []
    try {
      const parsed = JSON.parse(row.actor_order ?? '[]')
      if (Array.isArray(parsed) && parsed.every((actorId) => typeof actorId === 'string')) {
        actorOrder = parsed
      }
    } catch {
      actorOrder = []
    }

    return {
      id: row.id,
      campaignId: row.campaign_id,
      entryId: row.entry_id ?? null,
      sceneMode: row.scene_mode,
      turnOrderMode: row.turn_order_mode,
      activeActorId: row.active_actor_id ?? null,
      actorOrder,
      turnNumber: row.turn_number ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapCampaignPartyMember(row: any): CampaignPartyMember {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      characterId: row.character_id,
      eligibilityStatus: row.eligibility_status,
      actorCategory: row.actor_category,
      active: Boolean(row.active),
      narrativeControlMode: row.narrative_control_mode,
      combatControlMode: row.combat_control_mode,
      displayOrder: row.display_order,
      joinedAt: row.joined_at,
      leftAt: row.left_at ?? null,
    }
  }

  private mapActorControlProfile(row: any): ActorControlProfile {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      characterId: row.character_id,
      actorCategory: row.actor_category,
      narrativeControlMode: row.narrative_control_mode,
      combatControlMode: row.combat_control_mode,
      priorities: row.priorities ?? null,
      motivations: row.motivations ?? null,
      fears: row.fears ?? null,
      valuePriorities: row.value_priorities ?? null,
      redLines: row.red_lines ?? null,
      tacticalPreferences: row.tactical_preferences ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapCampaignSession(row: any): CampaignSession {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      sessionNumber: row.session_number,
      title: row.title ?? null,
      primaryCharacterId: row.primary_character_id,
      narrativeControlPolicy: row.narrative_control_policy,
      combatControlPolicy: row.combat_control_policy,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
    }
  }

  private mapSessionPartyMember(row: any): SessionPartyMember {
    return {
      id: row.id,
      sessionId: row.session_id,
      characterId: row.character_id,
      partyOrder: row.party_order,
      actorCategory: row.actor_category,
      narrativeControlMode: row.narrative_control_mode,
      combatControlMode: row.combat_control_mode,
      joinedAt: row.joined_at,
      leftAt: row.left_at ?? null,
    }
  }

  private mapRuleset(row: any): Ruleset {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      isBuiltin: Boolean(row.is_builtin),
      diceSystem: row.dice_system,
      defaultCheckRuleKey: row.default_check_rule_key ?? null,
      encumbranceMode: row.encumbrance_mode === 'weight' ? 'weight' : 'slot',
      encumbranceCapacityFormula:
        row.encumbrance_capacity_formula ?? '10 + strength + constitution + level',
      inventorySlotCapacityFormula:
        row.inventory_slot_capacity_formula ?? '10 + strength + constitution + level',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapRulesetStat(row: any): RulesetStat {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      defaultValue: row.default_value,
      minValue: row.min_value ?? null,
      maxValue: row.max_value ?? null,
      sortOrder: row.sort_order,
    }
  }

  private mapRulesetSkill(row: any): RulesetSkill {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      governingStatKey: row.governing_stat_key ?? null,
      sortOrder: row.sort_order,
    }
  }

  private mapRulesetCheckRule(row: any): RulesetCheckRule {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      notation: row.notation,
      criticalSuccessThreshold: row.critical_success_threshold ?? null,
      criticalFailureThreshold: row.critical_failure_threshold ?? null,
      outcomeBands: JSON.parse(row.outcome_bands),
      sortOrder: row.sort_order,
    }
  }

  private mapRulesetCondition(row: any): RulesetCondition {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      description: row.description ?? null,
      sortOrder: row.sort_order,
    }
  }

  private mapRulesetSlot(row: any): RulesetSlot {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      slotType: row.slot_type === 'inventory' ? 'inventory' : 'wearable',
      sortOrder: row.sort_order,
    }
  }

  private mapRulesetAbility(row: any): RulesetAbility {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      description: row.description ?? null,
      resourceKey: row.resource_key ?? null,
      resourceCost: row.resource_cost,
      sortOrder: row.sort_order,
    }
  }

  private mapRulesetSpell(row: any): RulesetSpell {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      description: row.description ?? null,
      level: row.level,
      notation: row.notation ?? null,
      resourceCost: row.resource_cost,
      sortOrder: row.sort_order,
    }
  }

  private mapRulesetCreature(row: any): RulesetCreature {
    let statBlock: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(row.stat_block ?? '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) statBlock = parsed
    } catch {
      statBlock = {}
    }
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      description: row.description ?? null,
      creatureType: row.creature_type ?? null,
      statBlock,
      sortOrder: row.sort_order,
    }
  }

  private mapRulesetLevel(row: any): RulesetLevel {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      level: row.level,
      label: row.label ?? null,
      xpThreshold: row.xp_threshold ?? null,
      statBonuses: row.stat_bonuses ? JSON.parse(row.stat_bonuses) : null,
    }
  }

  private mapRulesetResource(row: any): RulesetResource {
    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      key: row.key,
      label: row.label,
      maxFormula: row.max_formula,
      minValue: row.min_value,
      sortOrder: row.sort_order,
    }
  }

  private mapCharacterSheet(row: any): CharacterSheet {
    return {
      characterId: row.character_id,
      rulesetId: row.ruleset_id,
      statValues: JSON.parse(row.stat_values),
      resourceValues: JSON.parse(row.resource_values),
      conditionStates: JSON.parse(row.condition_states),
      level: row.level,
      xp: row.xp,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapRollLedgerEntry(row: any): RollLedgerEntry {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      sessionId: row.session_id ?? null,
      actorId: row.actor_id ?? null,
      notation: row.notation,
      seed: row.seed,
      rolls: JSON.parse(row.rolls),
      modifier: row.modifier,
      total: row.total,
      dc: row.dc ?? null,
      outcome: row.outcome ?? null,
      reason: row.reason ?? null,
      visibility: row.visibility,
      biasApplied: row.bias_applied ? JSON.parse(row.bias_applied) : null,
      createdAt: row.created_at,
    }
  }

  private mapStory(row: any): Story {
    const retryState = row.retry_state ? JSON.parse(row.retry_state) : null
    if (retryState) {
      console.log('[Database] Loading story with retry state', {
        storyId: row.id,
        hasCharacterSnapshots: !!retryState.characterSnapshots,
        characterSnapshotsCount: retryState.characterSnapshots?.length ?? 0,
        characterSnapshots: retryState.characterSnapshots?.map((s: any) => ({
          id: s.id,
          visualDescriptors: s.visualDescriptors,
          traits: s.traits,
        })),
      })
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      genre: row.genre,
      folderId: row.folder_id ?? null,
      templateId: row.template_id,
      mode: row.mode || 'adventure',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      settings: row.settings ? JSON.parse(row.settings) : null,
      memoryConfig: row.memory_config ? JSON.parse(row.memory_config) : null,
      retryState,
      styleReviewState: row.style_review_state ? JSON.parse(row.style_review_state) : null,
      timeTracker: row.time_tracker ? JSON.parse(row.time_tracker) : null,
      currentBranchId: row.current_branch_id || null,
      currentBgImage: null, // Loaded separately now
    }
  }

  private mapStoryFolder(row: any): StoryFolder {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapStoryEntry(row: any): StoryEntry {
    return {
      id: row.id,
      storyId: row.story_id,
      type: row.type,
      content: row.content,
      parentId: row.parent_id,
      position: row.position,
      createdAt: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
      reasoning: row.reasoning || undefined,
      // Translation fields
      translatedContent: row.translated_content || null,
      translationLanguage: row.translation_language || null,
      originalInput: row.original_input || null,
      // Phase 1: World state delta
      worldStateDelta: row.world_state_delta ? JSON.parse(row.world_state_delta) : null,
      // Persisted action suggestions for time-travel
      suggestedActions: row.suggested_actions || null,
    }
  }

  private mapCharacter(row: any): Character {
    const rawDescriptors = row.visual_descriptors ? JSON.parse(row.visual_descriptors) : null
    const rawTranslatedDescriptors = row.translated_visual_descriptors
      ? JSON.parse(row.translated_visual_descriptors)
      : null

    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      description: row.description,
      relationship: row.relationship,
      traits: row.traits ? JSON.parse(row.traits) : [],
      visualDescriptors: migrateVisualDescriptors(rawDescriptors),
      portrait: row.portrait || null,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
      overridesId: row.overrides_id || null,
      deleted: row.deleted === 1,
      // Translation fields
      translatedName: row.translated_name || null,
      translatedDescription: row.translated_description || null,
      translatedRelationship: row.translated_relationship || null,
      translatedTraits: row.translated_traits ? JSON.parse(row.translated_traits) : null,
      translatedVisualDescriptors: rawTranslatedDescriptors
        ? migrateVisualDescriptors(rawTranslatedDescriptors)
        : null,
      translationLanguage: row.translation_language || null,
    }
  }

  private mapLocation(row: any): Location {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      description: row.description,
      visited: row.visited === 1,
      current: row.current === 1,
      connections: row.connections ? JSON.parse(row.connections) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
      overridesId: row.overrides_id || null,
      deleted: row.deleted === 1,
      // Translation fields
      translatedName: row.translated_name || null,
      translatedDescription: row.translated_description || null,
      translationLanguage: row.translation_language || null,
    }
  }

  private mapItem(row: any): Item {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      description: row.description,
      quantity: row.quantity,
      weight: Number(row.weight ?? 0),
      equipped: row.equipped === 1,
      location: row.location,
      ownerCharacterId: row.owner_character_id || null,
      slotKey: row.slot_key || null,
      containerItemId: row.container_item_id || null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
      overridesId: row.overrides_id || null,
      deleted: row.deleted === 1,
      // Translation fields
      translatedName: row.translated_name || null,
      translatedDescription: row.translated_description || null,
      translationLanguage: row.translation_language || null,
    }
  }

  private mapStoryBeat(row: any): StoryBeat {
    return {
      id: row.id,
      storyId: row.story_id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      triggeredAt: row.triggered_at,
      resolvedAt: row.resolved_at ?? null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
      overridesId: row.overrides_id || null,
      deleted: row.deleted === 1,
      // Translation fields
      translatedTitle: row.translated_title || null,
      translatedDescription: row.translated_description || null,
      translationLanguage: row.translation_language || null,
    }
  }

  private mapChapter(row: any): Chapter {
    return {
      id: row.id,
      storyId: row.story_id,
      number: row.number,
      title: row.title,
      startEntryId: row.start_entry_id,
      endEntryId: row.end_entry_id,
      entryCount: row.entry_count,
      summary: row.summary,
      startTime: row.start_time ? JSON.parse(row.start_time) : null,
      endTime: row.end_time ? JSON.parse(row.end_time) : null,
      keywords: row.keywords ? JSON.parse(row.keywords) : [],
      characters: row.characters ? JSON.parse(row.characters) : [],
      locations: row.locations ? JSON.parse(row.locations) : [],
      plotThreads: row.plot_threads ? JSON.parse(row.plot_threads) : [],
      emotionalTone: row.emotional_tone,
      branchId: row.branch_id || null,
      createdAt: row.created_at,
    }
  }

  private mapChapterSource(row: any): ChapterSource {
    return {
      id: row.id,
      storyId: row.story_id,
      branchId: row.branch_id || null,
      title: row.title,
      sourceFilename: row.source_filename || null,
      chapterNumber: row.chapter_number ?? null,
      rawText: row.raw_text,
      summary: row.summary || null,
      keywords: row.keywords ? JSON.parse(row.keywords) : [],
      characters: row.characters ? JSON.parse(row.characters) : [],
      locations: row.locations ? JSON.parse(row.locations) : [],
      plotThreads: row.plot_threads ? JSON.parse(row.plot_threads) : [],
      emotionalTone: row.emotional_tone || null,
      sourceType: row.source_type || 'import',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapCheckpoint(row: any): Checkpoint {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      lastEntryId: row.last_entry_id,
      lastEntryPreview: row.last_entry_preview,
      entryCount: row.entry_count,
      entriesSnapshot: row.entries_snapshot ? JSON.parse(row.entries_snapshot) : [],
      charactersSnapshot: row.characters_snapshot ? JSON.parse(row.characters_snapshot) : [],
      locationsSnapshot: row.locations_snapshot ? JSON.parse(row.locations_snapshot) : [],
      itemsSnapshot: row.items_snapshot ? JSON.parse(row.items_snapshot) : [],
      storyBeatsSnapshot: row.story_beats_snapshot ? JSON.parse(row.story_beats_snapshot) : [],
      chaptersSnapshot: row.chapters_snapshot ? JSON.parse(row.chapters_snapshot) : [],
      // Use null when missing - old checkpoints without time tracking should reset time to null on restore
      timeTrackerSnapshot: row.time_tracker_snapshot ? JSON.parse(row.time_tracker_snapshot) : null,
      // undefined if column doesn't exist (old checkpoints) - preserve current lorebook on restore
      lorebookEntriesSnapshot: row.lorebook_entries_snapshot
        ? JSON.parse(row.lorebook_entries_snapshot)
        : undefined,
      createdAt: row.created_at,
    }
  }

  private mapWorldStateSnapshot(row: any): WorldStateSnapshot {
    return {
      id: row.id,
      storyId: row.story_id,
      branchId: row.branch_id || null,
      entryId: row.entry_id,
      entryPosition: row.entry_position,
      charactersSnapshot: row.characters_snapshot ? JSON.parse(row.characters_snapshot) : [],
      locationsSnapshot: row.locations_snapshot ? JSON.parse(row.locations_snapshot) : [],
      itemsSnapshot: row.items_snapshot ? JSON.parse(row.items_snapshot) : [],
      storyBeatsSnapshot: row.story_beats_snapshot ? JSON.parse(row.story_beats_snapshot) : [],
      lorebookEntriesSnapshot: row.lorebook_entries_snapshot
        ? JSON.parse(row.lorebook_entries_snapshot)
        : undefined,
      timeTrackerSnapshot: row.time_tracker_snapshot ? JSON.parse(row.time_tracker_snapshot) : null,
      createdAt: row.created_at,
    }
  }

  private mapEntry(row: any): Entry {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      type: row.type,
      description: row.description || '',
      hiddenInfo: row.hidden_info,
      aliases: row.aliases ? JSON.parse(row.aliases) : [],
      state: row.state ? JSON.parse(row.state) : { type: row.type },
      adventureState: row.adventure_state ? JSON.parse(row.adventure_state) : null,
      injection: row.injection
        ? JSON.parse(row.injection)
        : { mode: 'keyword', keywords: [], priority: 0 },
      firstMentioned: row.first_mentioned,
      lastMentioned: row.last_mentioned,
      mentionCount: row.mention_count ?? 0,
      createdBy: row.created_by || 'user',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      loreManagementBlacklisted: row.lore_management_blacklisted === 1,
      visibilityScope: row.visibility_scope || 'both',
      secrecyScope: row.secrecy_scope || 'public',
      revealState: row.reveal_state || 'revealed',
      branchId: row.branch_id || null,
      overridesId: row.overrides_id || null,
      deleted: row.deleted === 1,
    }
  }

  private mapEpistemicSecretAtom(row: any): EpistemicSecretAtom {
    return {
      id: row.id,
      storyId: row.story_id,
      parentEntryId: row.parent_entry_id ?? null,
      label: row.label,
      payloadHidden: row.payload_hidden,
      payloadForeshadow: row.payload_foreshadow ?? null,
      secrecyScope: row.secrecy_scope,
      revealState: row.reveal_state,
      revealConstraints: row.reveal_constraints ? JSON.parse(row.reveal_constraints) : null,
      provenance: row.provenance ? JSON.parse(row.provenance) : null,
      visibilityScope: row.visibility_scope,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapEpistemicCharacterKnowledgeEdge(row: any): EpistemicCharacterKnowledgeEdge {
    return {
      id: row.id,
      storyId: row.story_id,
      atomId: row.atom_id,
      characterRefType: row.character_ref_type,
      characterRefId: row.character_ref_id,
      characterId: row.character_id ?? null,
      knows: row.knows === 1,
      confidence: row.confidence,
      disclosureIntent: row.disclosure_intent,
      disclosurePolicy: row.disclosure_policy,
      rationaleTags: row.rationale_tags ? JSON.parse(row.rationale_tags) : [],
      pressureTags: row.pressure_tags ? JSON.parse(row.pressure_tags) : [],
      learnedVia: row.learned_via ?? null,
      learnedAt: row.learned_at ?? null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      updatedAt: row.updated_at,
    }
  }

  private mapDirectorProposalArtifact(row: any): DirectorProposalArtifact {
    return {
      id: row.id,
      storyId: row.story_id,
      authorType: row.author_type,
      proposalType: row.proposal_type,
      title: row.title ?? null,
      draftPayload: row.draft_payload ? JSON.parse(row.draft_payload) : {},
      diffPayload: row.diff_payload ? JSON.parse(row.diff_payload) : null,
      approvalState: row.approval_state,
      approvedBy: row.approved_by ?? null,
      approvedAt: row.approved_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private async ensureChapterSourcesTable(db: any): Promise<void> {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS chapter_sources (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        branch_id TEXT,

        title TEXT NOT NULL,
        source_filename TEXT,
        chapter_number INTEGER,
        raw_text TEXT NOT NULL,

        summary TEXT,
        keywords TEXT,
        characters TEXT,
        locations TEXT,
        plot_threads TEXT,
        emotional_tone TEXT,

        source_type TEXT NOT NULL DEFAULT 'import',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,

        FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      )
    `)

    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_chapter_sources_story ON chapter_sources(story_id)',
    )
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_chapter_sources_branch ON chapter_sources(story_id, branch_id)',
    )
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_chapter_sources_number ON chapter_sources(story_id, chapter_number)',
    )
  }

  private async ensureDirectorProposalArtifactsTable(db: any): Promise<void> {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS director_assistant_artifacts (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        author_type TEXT NOT NULL DEFAULT 'assistant',
        proposal_type TEXT NOT NULL,
        title TEXT,
        draft_payload TEXT NOT NULL,
        diff_payload TEXT,
        approval_state TEXT NOT NULL DEFAULT 'pending',
        approved_by TEXT,
        approved_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
      )
    `)
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_director_artifacts_story_created ON director_assistant_artifacts(story_id, created_at DESC)',
    )
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_director_artifacts_story_state ON director_assistant_artifacts(story_id, approval_state)',
    )
  }

  private async ensureEditorAssistantConversationsTable(db: any): Promise<void> {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS editor_assistant_conversations (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        messages TEXT NOT NULL,
        chat_messages TEXT NOT NULL DEFAULT '[]',
        pending_edits TEXT NOT NULL DEFAULT '[]',
        ui_state TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
      )
    `)
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_editor_assistant_conversations_story_updated ON editor_assistant_conversations(story_id, updated_at DESC)',
    )
  }

  // ===== Character Vault Operations =====

  async getVaultCharacters(): Promise<VaultCharacter[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM character_vault ORDER BY favorite DESC, updated_at DESC',
    )
    return results.map(this.mapVaultCharacter)
  }

  async getVaultCharacter(id: string): Promise<VaultCharacter | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM character_vault WHERE id = ?', [id])
    return results.length > 0 ? this.mapVaultCharacter(results[0]) : null
  }

  async addVaultCharacter(character: VaultCharacter): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO character_vault (
        id, name, description,
        traits, visual_descriptors, portrait,
        tags, favorite, source, original_story_id, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        character.id,
        character.name,
        character.description,
        JSON.stringify(character.traits),
        JSON.stringify(character.visualDescriptors),
        character.portrait,
        JSON.stringify(character.tags),
        character.favorite ? 1 : 0,
        character.source,
        character.originalStoryId,
        character.metadata ? JSON.stringify(character.metadata) : null,
        character.createdAt,
        character.updatedAt,
      ],
    )
  }

  async updateVaultCharacter(id: string, updates: Partial<VaultCharacter>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.traits !== undefined) {
      setClauses.push('traits = ?')
      values.push(JSON.stringify(updates.traits))
    }
    if (updates.visualDescriptors !== undefined) {
      setClauses.push('visual_descriptors = ?')
      values.push(JSON.stringify(updates.visualDescriptors))
    }
    if (updates.portrait !== undefined) {
      setClauses.push('portrait = ?')
      values.push(updates.portrait)
    }
    if (updates.tags !== undefined) {
      setClauses.push('tags = ?')
      values.push(JSON.stringify(updates.tags))
    }
    if (updates.favorite !== undefined) {
      setClauses.push('favorite = ?')
      values.push(updates.favorite ? 1 : 0)
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null)
    }

    values.push(id)
    await db.execute(`UPDATE character_vault SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteVaultCharacter(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM character_vault WHERE id = ?', [id])
  }

  async searchVaultCharacters(query: string): Promise<VaultCharacter[]> {
    const db = await this.getDb()
    const searchPattern = `%${query}%`
    const results = await db.select<any[]>(
      `SELECT * FROM character_vault WHERE 
        name LIKE ? OR description LIKE ? OR tags LIKE ?
      ORDER BY favorite DESC, updated_at DESC`,
      [searchPattern, searchPattern, searchPattern],
    )
    return results.map(this.mapVaultCharacter)
  }

  private mapVaultCharacter(row: any): VaultCharacter {
    const rawDescriptors = row.visual_descriptors ? JSON.parse(row.visual_descriptors) : null

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      traits: row.traits ? JSON.parse(row.traits) : [],
      visualDescriptors: migrateVisualDescriptors(rawDescriptors),
      portrait: row.portrait,
      tags: row.tags ? JSON.parse(row.tags) : [],
      favorite: row.favorite === 1,
      source: row.source || 'manual',
      originalStoryId: row.original_story_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // ===== Lorebook Vault Operations =====

  async getVaultLorebooks(): Promise<VaultLorebook[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM lorebook_vault ORDER BY favorite DESC, updated_at DESC',
    )
    return results.map(this.mapVaultLorebook)
  }

  async getVaultLorebook(id: string): Promise<VaultLorebook | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM lorebook_vault WHERE id = ?', [id])
    return results.length > 0 ? this.mapVaultLorebook(results[0]) : null
  }

  async addVaultLorebook(lorebook: VaultLorebook): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO lorebook_vault (
        id, name, description, entries,
        tags, favorite, source, original_filename, original_story_id,
        metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lorebook.id,
        lorebook.name,
        lorebook.description,
        JSON.stringify(lorebook.entries),
        JSON.stringify(lorebook.tags),
        lorebook.favorite ? 1 : 0,
        lorebook.source,
        lorebook.originalFilename,
        lorebook.originalStoryId,
        lorebook.metadata ? JSON.stringify(lorebook.metadata) : null,
        lorebook.createdAt,
        lorebook.updatedAt,
      ],
    )
  }

  async updateVaultLorebook(id: string, updates: Partial<VaultLorebook>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.entries !== undefined) {
      setClauses.push('entries = ?')
      values.push(JSON.stringify(updates.entries))
    }
    if (updates.tags !== undefined) {
      setClauses.push('tags = ?')
      values.push(JSON.stringify(updates.tags))
    }
    if (updates.favorite !== undefined) {
      setClauses.push('favorite = ?')
      values.push(updates.favorite ? 1 : 0)
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null)
    }

    values.push(id)
    await db.execute(`UPDATE lorebook_vault SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteVaultLorebook(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM lorebook_vault WHERE id = ?', [id])
  }

  async searchVaultLorebooks(query: string): Promise<VaultLorebook[]> {
    const db = await this.getDb()
    const searchPattern = `%${query}%`
    const results = await db.select<any[]>(
      `SELECT * FROM lorebook_vault WHERE 
        name LIKE ? OR description LIKE ? OR tags LIKE ?
      ORDER BY favorite DESC, updated_at DESC`,
      [searchPattern, searchPattern, searchPattern],
    )
    return results.map(this.mapVaultLorebook)
  }

  private mapVaultLorebook(row: any): VaultLorebook {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      entries: row.entries ? JSON.parse(row.entries) : [],
      tags: row.tags ? JSON.parse(row.tags) : [],
      favorite: row.favorite === 1,
      source: row.source || 'import',
      originalFilename: row.original_filename,
      originalStoryId: row.original_story_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // ===== Scenario Vault Operations =====

  async getVaultScenarios(): Promise<VaultScenario[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM scenario_vault ORDER BY favorite DESC, updated_at DESC',
    )
    return results.map(this.mapVaultScenario)
  }

  async getVaultScenario(id: string): Promise<VaultScenario | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM scenario_vault WHERE id = ?', [id])
    return results.length > 0 ? this.mapVaultScenario(results[0]) : null
  }

  async addVaultScenario(scenario: VaultScenario): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO scenario_vault (
        id, name, description, setting_seed, npcs, primary_character_name,
        first_message, alternate_greetings, tags, favorite, source,
        original_filename, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scenario.id,
        scenario.name,
        scenario.description,
        scenario.settingSeed,
        JSON.stringify(scenario.npcs),
        scenario.primaryCharacterName,
        scenario.firstMessage,
        JSON.stringify(scenario.alternateGreetings),
        JSON.stringify(scenario.tags),
        scenario.favorite ? 1 : 0,
        scenario.source,
        scenario.originalFilename,
        scenario.metadata ? JSON.stringify(scenario.metadata) : null,
        scenario.createdAt,
        scenario.updatedAt,
      ],
    )
  }

  async updateVaultScenario(id: string, updates: Partial<VaultScenario>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.settingSeed !== undefined) {
      setClauses.push('setting_seed = ?')
      values.push(updates.settingSeed)
    }
    if (updates.npcs !== undefined) {
      setClauses.push('npcs = ?')
      values.push(JSON.stringify(updates.npcs))
    }
    if (updates.primaryCharacterName !== undefined) {
      setClauses.push('primary_character_name = ?')
      values.push(updates.primaryCharacterName)
    }
    if (updates.firstMessage !== undefined) {
      setClauses.push('first_message = ?')
      values.push(updates.firstMessage)
    }
    if (updates.alternateGreetings !== undefined) {
      setClauses.push('alternate_greetings = ?')
      values.push(JSON.stringify(updates.alternateGreetings))
    }
    if (updates.tags !== undefined) {
      setClauses.push('tags = ?')
      values.push(JSON.stringify(updates.tags))
    }
    if (updates.favorite !== undefined) {
      setClauses.push('favorite = ?')
      values.push(updates.favorite ? 1 : 0)
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null)
    }

    values.push(id)
    await db.execute(`UPDATE scenario_vault SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deleteVaultScenario(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM scenario_vault WHERE id = ?', [id])
  }

  async searchVaultScenarios(query: string): Promise<VaultScenario[]> {
    const db = await this.getDb()
    const searchPattern = `%${query}%`
    const results = await db.select<any[]>(
      `SELECT * FROM scenario_vault WHERE 
        name LIKE ? OR description LIKE ? OR tags LIKE ? OR setting_seed LIKE ?
      ORDER BY favorite DESC, updated_at DESC`,
      [searchPattern, searchPattern, searchPattern, searchPattern],
    )
    return results.map(this.mapVaultScenario)
  }

  // ===== Vault Tag Operations =====

  async getVaultTags(type?: VaultType): Promise<VaultTag[]> {
    const db = await this.getDb()
    const query = type
      ? 'SELECT * FROM vault_tags WHERE type = ? ORDER BY name ASC'
      : 'SELECT * FROM vault_tags ORDER BY type ASC, name ASC'
    const params = type ? [type] : []

    const results = await db.select<any[]>(query, params)
    return results.map(this.mapVaultTag)
  }

  async addVaultTag(tag: VaultTag): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      'INSERT INTO vault_tags (id, name, type, color, created_at) VALUES (?, ?, ?, ?, ?)',
      [tag.id, tag.name, tag.type, tag.color, tag.createdAt],
    )
  }

  async updateVaultTag(id: string, updates: Partial<VaultTag>): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    // Get current tag first if we're updating the name
    let oldName: string | null = null
    let type: VaultType | null = null

    if (updates.name !== undefined) {
      const currentTag = await this.getDb().then((d) =>
        d.select<any[]>('SELECT name, type FROM vault_tags WHERE id = ?', [id]),
      )
      if (currentTag.length > 0) {
        oldName = currentTag[0].name
        type = currentTag[0].type as VaultType
      }
    }

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.color !== undefined) {
      setClauses.push('color = ?')
      values.push(updates.color)
    }

    if (setClauses.length === 0) return

    values.push(id)
    await db.execute(`UPDATE vault_tags SET ${setClauses.join(', ')} WHERE id = ?`, values)

    // If name changed, we must update all vault items that use this tag
    // This is a heavy operation but safe because we use transactions implicitly or just sequence it
    if (oldName && updates.name && type && oldName !== updates.name) {
      await this.migrateTagInVaultItems(type, oldName, updates.name)
    }
  }

  async deleteVaultTag(id: string): Promise<void> {
    const db = await this.getDb()

    // Get the tag first to know its name and type
    const tagResult = await db.select<any[]>('SELECT name, type FROM vault_tags WHERE id = ?', [id])
    if (tagResult.length === 0) return

    const { name, type } = tagResult[0]

    // Delete definition
    await db.execute('DELETE FROM vault_tags WHERE id = ?', [id])

    // Remove from all vault items
    await this.removeTagFromVaultItems(type, name)
  }

  // Helper to rename a tag across all vault items
  private async migrateTagInVaultItems(
    type: VaultType,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const db = await this.getDb()
    let table = ''

    if (type === 'character') table = 'character_vault'
    else if (type === 'lorebook') table = 'lorebook_vault'
    else if (type === 'scenario') table = 'scenario_vault'

    if (!table) return

    // We have to read all rows that might contain the tag, update JSON, and write back
    // A simple REPLACE string might be dangerous if tag name is a substring of another tag
    const rows = await db.select<{ id: string; tags: string }[]>(
      `SELECT id, tags FROM ${table} WHERE tags LIKE ?`,
      [`%${oldName}%`],
    )

    for (const row of rows) {
      try {
        const tags = JSON.parse(row.tags) as string[]
        const index = tags.indexOf(oldName)
        if (index !== -1) {
          tags[index] = newName
          await db.execute(`UPDATE ${table} SET tags = ? WHERE id = ?`, [
            JSON.stringify(tags),
            row.id,
          ])
        }
      } catch (e) {
        console.error(`[Database] Failed to migrate tag for ${table} row ${row.id}`, e)
      }
    }
  }

  // Helper to remove a tag from all vault items
  private async removeTagFromVaultItems(type: VaultType, tagName: string): Promise<void> {
    const db = await this.getDb()
    let table = ''

    if (type === 'character') table = 'character_vault'
    else if (type === 'lorebook') table = 'lorebook_vault'
    else if (type === 'scenario') table = 'scenario_vault'

    if (!table) return

    const rows = await db.select<{ id: string; tags: string }[]>(
      `SELECT id, tags FROM ${table} WHERE tags LIKE ?`,
      [`%${tagName}%`],
    )

    for (const row of rows) {
      try {
        let tags = JSON.parse(row.tags) as string[]
        if (tags.includes(tagName)) {
          tags = tags.filter((t) => t !== tagName)
          await db.execute(`UPDATE ${table} SET tags = ? WHERE id = ?`, [
            JSON.stringify(tags),
            row.id,
          ])
        }
      } catch (e) {
        console.error(`[Database] Failed to remove tag for ${table} row ${row.id}`, e)
      }
    }
  }

  // Migration: Populate vault_tags from existing vault data
  async ensureTagsMigrated(): Promise<void> {
    const db = await this.getDb()

    // Check if we have any tags
    const count = await db.select<{ c: number }[]>('SELECT COUNT(*) as c FROM vault_tags')
    // If we already have tags, we assume migration is done or in progress
    // But we might want to check for new tags that appeared from imports?
    // For now, let's just do it if empty to seed the system
    if (count[0].c > 0) return

    console.log('[Database] Migrating existing tags to vault_tags table...')

    const colors = [
      'red-500',
      'orange-500',
      'amber-500',
      'yellow-500',
      'lime-500',
      'green-500',
      'emerald-500',
      'teal-500',
      'cyan-500',
      'sky-500',
      'blue-500',
      'indigo-500',
      'violet-500',
      'purple-500',
      'fuchsia-500',
      'pink-500',
      'rose-500',
    ]

    const processTable = async (table: string, type: VaultType) => {
      const rows = await db.select<{ tags: string }[]>(`SELECT tags FROM ${table}`)
      const uniqueTags = new Set<string>()

      for (const row of rows) {
        try {
          const tags = JSON.parse(row.tags) as string[]
          tags.forEach((t) => uniqueTags.add(t.trim()))
        } catch {}
      }

      for (const tagName of uniqueTags) {
        if (!tagName) continue
        const color = colors[Math.floor(Math.random() * colors.length)]
        // Use crypto.randomUUID() if available, otherwise simple random
        const id = crypto.randomUUID()

        try {
          await db.execute(
            'INSERT INTO vault_tags (id, name, type, color, created_at) VALUES (?, ?, ?, ?, ?)',
            [id, tagName, type, color, Date.now()],
          )
        } catch {
          // Ignore unique constraint errors
          console.warn(`[Database] Skipped duplicate tag ${tagName} during migration`)
        }
      }
    }

    await processTable('character_vault', 'character')
    await processTable('lorebook_vault', 'lorebook')
    await processTable('scenario_vault', 'scenario')

    console.log('[Database] Tag migration complete')
  }

  // Vault assistant conversation operations

  async createVaultConversation(conversation: VaultConversation): Promise<void> {
    const db = await this.getDb()
    await db.execute(
      `INSERT INTO vault_assistant_conversations (id, title, created_at, updated_at, messages, chat_messages, pending_changes, entry_versions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation.id,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt,
        conversation.messages,
        conversation.chatMessages,
        conversation.pendingChanges,
        conversation.entryVersions ?? '[]',
      ],
    )
  }

  async listVaultConversations(): Promise<VaultConversation[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      `SELECT id, title, created_at, updated_at
       FROM vault_assistant_conversations
       ORDER BY updated_at DESC`,
    )
    return results.map(this.mapVaultConversationSummary)
  }

  async loadVaultConversation(id: string): Promise<VaultConversation | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM vault_assistant_conversations WHERE id = ?',
      [id],
    )
    return results.length > 0 ? this.mapVaultConversation(results[0]) : null
  }

  async saveVaultConversation(
    id: string,
    updates: {
      title?: string
      messages?: string
      chatMessages?: string
      pendingChanges?: string
      entryVersions?: string
    },
  ): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = ['updated_at = ?']
    const values: unknown[] = [new Date().toISOString()]

    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.messages !== undefined) {
      setClauses.push('messages = ?')
      values.push(updates.messages)
    }
    if (updates.chatMessages !== undefined) {
      setClauses.push('chat_messages = ?')
      values.push(updates.chatMessages)
    }
    if (updates.pendingChanges !== undefined) {
      setClauses.push('pending_changes = ?')
      values.push(updates.pendingChanges)
    }
    if (updates.entryVersions !== undefined) {
      setClauses.push('entry_versions = ?')
      values.push(updates.entryVersions)
    }

    values.push(id)
    await db.execute(
      `UPDATE vault_assistant_conversations SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    )
  }

  async deleteVaultConversation(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM vault_assistant_conversations WHERE id = ?', [id])
  }

  private mapVaultConversation(row: any): VaultConversation {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: row.messages,
      chatMessages: row.chat_messages ?? '[]',
      pendingChanges: row.pending_changes ?? '[]',
      entryVersions: row.entry_versions ?? undefined,
    }
  }

  private mapVaultConversationSummary(row: any): VaultConversation {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: '[]',
      chatMessages: '[]',
      pendingChanges: '[]',
      entryVersions: undefined,
    }
  }

  // Editor assistant conversation operations

  async createEditorConversation(conversation: EditorConversation): Promise<void> {
    const db = await this.getDb()
    await this.ensureEditorAssistantConversationsTable(db)
    await db.execute(
      `INSERT INTO editor_assistant_conversations (
        id, story_id, title, created_at, updated_at, messages, chat_messages, pending_edits, ui_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation.id,
        conversation.storyId,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt,
        conversation.messages,
        conversation.chatMessages,
        conversation.pendingEdits,
        conversation.uiState ?? '{}',
      ],
    )
  }

  async listEditorConversations(storyId: string): Promise<EditorConversation[]> {
    const db = await this.getDb()
    await this.ensureEditorAssistantConversationsTable(db)
    const results = await db.select<any[]>(
      `SELECT id, story_id, title, created_at, updated_at
       FROM editor_assistant_conversations
       WHERE story_id = ?
       ORDER BY updated_at DESC`,
      [storyId],
    )
    return results.map(this.mapEditorConversationSummary)
  }

  async loadEditorConversation(id: string): Promise<EditorConversation | null> {
    const db = await this.getDb()
    await this.ensureEditorAssistantConversationsTable(db)
    const results = await db.select<any[]>(
      'SELECT * FROM editor_assistant_conversations WHERE id = ?',
      [id],
    )
    return results.length > 0 ? this.mapEditorConversation(results[0]) : null
  }

  async saveEditorConversation(
    id: string,
    updates: {
      title?: string
      messages?: string
      chatMessages?: string
      pendingEdits?: string
      uiState?: string
    },
  ): Promise<void> {
    const db = await this.getDb()
    await this.ensureEditorAssistantConversationsTable(db)
    const setClauses: string[] = ['updated_at = ?']
    const values: unknown[] = [new Date().toISOString()]

    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.messages !== undefined) {
      setClauses.push('messages = ?')
      values.push(updates.messages)
    }
    if (updates.chatMessages !== undefined) {
      setClauses.push('chat_messages = ?')
      values.push(updates.chatMessages)
    }
    if (updates.pendingEdits !== undefined) {
      setClauses.push('pending_edits = ?')
      values.push(updates.pendingEdits)
    }
    if (updates.uiState !== undefined) {
      setClauses.push('ui_state = ?')
      values.push(updates.uiState)
    }

    values.push(id)
    await db.execute(
      `UPDATE editor_assistant_conversations SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    )
  }

  async deleteEditorConversation(id: string): Promise<void> {
    const db = await this.getDb()
    await this.ensureEditorAssistantConversationsTable(db)
    await db.execute('DELETE FROM editor_assistant_conversations WHERE id = ?', [id])
  }

  private mapEditorConversation(row: any): EditorConversation {
    return {
      id: row.id,
      storyId: row.story_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: row.messages,
      chatMessages: row.chat_messages ?? '[]',
      pendingEdits: row.pending_edits ?? '[]',
      uiState: row.ui_state ?? '{}',
    }
  }

  private mapEditorConversationSummary(row: any): EditorConversation {
    return {
      id: row.id,
      storyId: row.story_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: '[]',
      chatMessages: '[]',
      pendingEdits: '[]',
      uiState: '{}',
    }
  }

  // ===== Preset Pack Operations =====

  async getAllPacks(): Promise<PresetPack[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM preset_packs ORDER BY is_default DESC, name ASC',
    )
    return results.map(this.mapPack)
  }

  async getPack(id: string): Promise<PresetPack | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM preset_packs WHERE id = ?', [id])
    return results.length > 0 ? this.mapPack(results[0]) : null
  }

  async getDefaultPack(): Promise<PresetPack | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM preset_packs WHERE is_default = 1 LIMIT 1',
    )
    return results.length > 0 ? this.mapPack(results[0]) : null
  }

  async createPack(pack: Omit<PresetPack, 'createdAt' | 'updatedAt'>): Promise<PresetPack> {
    const db = await this.getDb()
    const now = Date.now()
    await db.execute(
      'INSERT INTO preset_packs (id, name, description, author, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [pack.id, pack.name, pack.description, pack.author, pack.isDefault ? 1 : 0, now, now],
    )
    return { ...pack, createdAt: now, updatedAt: now }
  }

  async updatePack(
    id: string,
    updates: { name?: string; description?: string | null; author?: string | null },
  ): Promise<void> {
    const db = await this.getDb()
    const now = Date.now()
    const setClauses: string[] = ['updated_at = ?']
    const values: any[] = [now]

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.author !== undefined) {
      setClauses.push('author = ?')
      values.push(updates.author)
    }

    values.push(id)
    await db.execute(`UPDATE preset_packs SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deletePack(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM preset_packs WHERE id = ? AND is_default = 0', [id])
  }

  async canDeletePack(packId: string): Promise<boolean> {
    const db = await this.getDb()
    // Cannot delete default pack
    const pack = await this.getPack(packId)
    if (!pack || pack.isDefault) return false
    // Cannot delete if stories reference it
    const results = await db.select<any[]>(
      'SELECT COUNT(*) as count FROM stories WHERE pack_id = ?',
      [packId],
    )
    return results[0].count === 0
  }

  async getPackUsageCount(packId: string): Promise<number> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT COUNT(*) as count FROM stories WHERE pack_id = ?',
      [packId],
    )
    return results[0].count
  }

  // ===== Pack Template Operations =====

  async getPackTemplates(packId: string): Promise<PackTemplate[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM pack_templates WHERE pack_id = ? ORDER BY template_id',
      [packId],
    )
    return results.map(this.mapPackTemplate)
  }

  async getPackTemplate(packId: string, templateId: string): Promise<PackTemplate | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM pack_templates WHERE pack_id = ? AND template_id = ?',
      [packId, templateId],
    )
    return results.length > 0 ? this.mapPackTemplate(results[0]) : null
  }

  async setPackTemplateContent(packId: string, templateId: string, content: string): Promise<void> {
    const db = await this.getDb()
    const now = Date.now()
    const contentHash = await hashContent(content)
    // Use INSERT OR REPLACE to handle both create and update
    // Need to preserve original created_at if exists
    const existing = await this.getPackTemplate(packId, templateId)
    const createdAt = existing ? existing.createdAt : now
    await db.execute(
      `INSERT OR REPLACE INTO pack_templates (id, pack_id, template_id, content, content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        existing?.id ?? crypto.randomUUID(),
        packId,
        templateId,
        content,
        contentHash,
        createdAt,
        now,
      ],
    )
  }

  async deletePackTemplate(packId: string, templateId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM pack_templates WHERE pack_id = ? AND template_id = ?', [
      packId,
      templateId,
    ])
  }

  // ===== Pack Variable Operations =====

  async getPackVariables(packId: string): Promise<CustomVariable[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM pack_variables WHERE pack_id = ? ORDER BY sort_order ASC, variable_name ASC',
      [packId],
    )
    return results.map(this.mapPackVariable)
  }

  async getPackVariable(packId: string, variableName: string): Promise<CustomVariable | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM pack_variables WHERE pack_id = ? AND variable_name = ?',
      [packId, variableName],
    )
    return results.length > 0 ? this.mapPackVariable(results[0]) : null
  }

  async createPackVariable(
    packId: string,
    variable: Omit<CustomVariable, 'id' | 'packId' | 'createdAt'>,
  ): Promise<CustomVariable> {
    const db = await this.getDb()
    const id = crypto.randomUUID()
    const now = Date.now()
    await db.execute(
      `INSERT INTO pack_variables (id, pack_id, variable_name, display_name, description, variable_type, is_required, sort_order, default_value, enum_options, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        packId,
        variable.variableName,
        variable.displayName,
        variable.description ?? null,
        variable.variableType,
        variable.isRequired ? 1 : 0,
        variable.sortOrder ?? 0,
        variable.defaultValue ?? null,
        variable.enumOptions ? JSON.stringify(variable.enumOptions) : null,
        now,
      ],
    )
    return { id, packId, ...variable, createdAt: now }
  }

  async updatePackVariable(
    id: string,
    updates: Partial<Omit<CustomVariable, 'id' | 'packId' | 'createdAt'>>,
  ): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.variableName !== undefined) {
      setClauses.push('variable_name = ?')
      values.push(updates.variableName)
    }
    if (updates.displayName !== undefined) {
      setClauses.push('display_name = ?')
      values.push(updates.displayName)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description || null)
    }
    if (updates.variableType !== undefined) {
      setClauses.push('variable_type = ?')
      values.push(updates.variableType)
    }
    if (updates.isRequired !== undefined) {
      setClauses.push('is_required = ?')
      values.push(updates.isRequired ? 1 : 0)
    }
    if (updates.sortOrder !== undefined) {
      setClauses.push('sort_order = ?')
      values.push(updates.sortOrder)
    }
    if (updates.defaultValue !== undefined) {
      setClauses.push('default_value = ?')
      values.push(updates.defaultValue)
    }
    if (updates.enumOptions !== undefined) {
      setClauses.push('enum_options = ?')
      values.push(updates.enumOptions ? JSON.stringify(updates.enumOptions) : null)
    }

    if (setClauses.length === 0) return

    values.push(id)
    await db.execute(`UPDATE pack_variables SET ${setClauses.join(', ')} WHERE id = ?`, values)
  }

  async deletePackVariable(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM pack_variables WHERE id = ?', [id])
  }

  // ===== Runtime Variable Definition Operations =====

  async getRuntimeVariables(packId: string): Promise<RuntimeVariable[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM pack_runtime_variables WHERE pack_id = ? ORDER BY entity_type ASC, sort_order ASC, variable_name ASC',
      [packId],
    )
    return results.map(this.mapRuntimeVariable)
  }

  async getRuntimeVariablesByEntityType(
    packId: string,
    entityType: RuntimeEntityType,
  ): Promise<RuntimeVariable[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM pack_runtime_variables WHERE pack_id = ? AND entity_type = ? ORDER BY sort_order ASC, variable_name ASC',
      [packId, entityType],
    )
    return results.map(this.mapRuntimeVariable)
  }

  async createRuntimeVariable(
    packId: string,
    variable: Omit<RuntimeVariable, 'id' | 'packId' | 'createdAt'>,
  ): Promise<RuntimeVariable> {
    const db = await this.getDb()
    const id = crypto.randomUUID()
    const now = Date.now()
    await db.execute(
      `INSERT INTO pack_runtime_variables (id, pack_id, entity_type, variable_name, display_name, description, variable_type, default_value, min_value, max_value, enum_options, color, icon, pinned, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        packId,
        variable.entityType,
        variable.variableName,
        variable.displayName,
        variable.description ?? null,
        variable.variableType,
        variable.defaultValue ?? null,
        variable.minValue ?? null,
        variable.maxValue ?? null,
        variable.enumOptions ? JSON.stringify(variable.enumOptions) : null,
        variable.color,
        variable.icon ?? null,
        variable.pinned ? 1 : 0,
        variable.sortOrder ?? 0,
        now,
      ],
    )
    return { id, packId, ...variable, createdAt: now }
  }

  async updateRuntimeVariable(
    id: string,
    updates: {
      entityType?: RuntimeEntityType
      variableName?: string
      displayName?: string
      description?: string | null
      variableType?: RuntimeVariableType
      defaultValue?: string | null
      minValue?: number | null
      maxValue?: number | null
      enumOptions?: EnumOption[] | null
      color?: string
      icon?: string | null
      pinned?: boolean
      sortOrder?: number
    },
  ): Promise<void> {
    const db = await this.getDb()
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.entityType !== undefined) {
      setClauses.push('entity_type = ?')
      values.push(updates.entityType)
    }
    if (updates.variableName !== undefined) {
      setClauses.push('variable_name = ?')
      values.push(updates.variableName)
    }
    if (updates.displayName !== undefined) {
      setClauses.push('display_name = ?')
      values.push(updates.displayName)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description || null)
    }
    if (updates.variableType !== undefined) {
      setClauses.push('variable_type = ?')
      values.push(updates.variableType)
    }
    if (updates.defaultValue !== undefined) {
      setClauses.push('default_value = ?')
      values.push(updates.defaultValue || null)
    }
    if (updates.minValue !== undefined) {
      setClauses.push('min_value = ?')
      values.push(updates.minValue)
    }
    if (updates.maxValue !== undefined) {
      setClauses.push('max_value = ?')
      values.push(updates.maxValue)
    }
    if (updates.enumOptions !== undefined) {
      setClauses.push('enum_options = ?')
      values.push(updates.enumOptions ? JSON.stringify(updates.enumOptions) : null)
    }
    if (updates.color !== undefined) {
      setClauses.push('color = ?')
      values.push(updates.color)
    }
    if (updates.icon !== undefined) {
      setClauses.push('icon = ?')
      values.push(updates.icon || null)
    }
    if (updates.pinned !== undefined) {
      setClauses.push('pinned = ?')
      values.push(updates.pinned ? 1 : 0)
    }
    if (updates.sortOrder !== undefined) {
      setClauses.push('sort_order = ?')
      values.push(updates.sortOrder)
    }

    if (setClauses.length === 0) return

    values.push(id)
    await db.execute(
      `UPDATE pack_runtime_variables SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    )
  }

  async deleteRuntimeVariable(id: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM pack_runtime_variables WHERE id = ?', [id])
  }

  // ===== Runtime Variable Entity Value Operations =====

  async getStoriesUsingPack(packId: string): Promise<string[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT id FROM stories WHERE pack_id = ?', [packId])
    return results.map((r) => r.id)
  }

  async countEntitiesWithRuntimeVar(packId: string, defId: string): Promise<number> {
    const storyIds = await this.getStoriesUsingPack(packId)
    if (storyIds.length === 0) return 0

    const db = await this.getDb()
    const placeholders = storyIds.map(() => '?').join(', ')
    const jsonPath = `$.runtimeVars.${defId}`

    const tables = ['characters', 'locations', 'items', 'story_beats']
    let total = 0

    for (const table of tables) {
      const results = await db.select<any[]>(
        `SELECT COUNT(*) as cnt FROM ${table} WHERE story_id IN (${placeholders}) AND json_extract(metadata, ?) IS NOT NULL`,
        [...storyIds, jsonPath],
      )
      total += results[0]?.cnt ?? 0
    }

    return total
  }

  async clearRuntimeVarFromEntities(packId: string, defId: string): Promise<void> {
    const storyIds = await this.getStoriesUsingPack(packId)
    if (storyIds.length === 0) return

    const db = await this.getDb()
    const placeholders = storyIds.map(() => '?').join(', ')
    const jsonPath = `$.runtimeVars.${defId}`

    const tables = ['characters', 'locations', 'items', 'story_beats']
    for (const table of tables) {
      await db.execute(
        `UPDATE ${table} SET metadata = json_remove(metadata, ?) WHERE story_id IN (${placeholders}) AND json_extract(metadata, ?) IS NOT NULL`,
        [jsonPath, ...storyIds, jsonPath],
      )
    }
  }

  async renameRuntimeVarInEntities(
    packId: string,
    defId: string,
    newVariableName: string,
  ): Promise<void> {
    const storyIds = await this.getStoriesUsingPack(packId)
    if (storyIds.length === 0) return

    const db = await this.getDb()
    const placeholders = storyIds.map(() => '?').join(', ')
    const jsonPath = `$.runtimeVars.${defId}`
    const varNamePath = `$.runtimeVars.${defId}.variableName`

    const tables = ['characters', 'locations', 'items', 'story_beats']
    for (const table of tables) {
      await db.execute(
        `UPDATE ${table} SET metadata = json_set(metadata, ?, ?) WHERE story_id IN (${placeholders}) AND json_extract(metadata, ?) IS NOT NULL`,
        [varNamePath, newVariableName, ...storyIds, jsonPath],
      )
    }
  }

  // ===== Story-Pack Assignment =====

  async getStoryPackId(storyId: string): Promise<string | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT pack_id FROM stories WHERE id = ?', [storyId])
    return results.length > 0 ? results[0].pack_id : null
  }

  async setStoryPack(storyId: string, packId: string): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET pack_id = ? WHERE id = ?', [packId, storyId])
  }

  /**
   * Get per-story custom variable value overrides.
   * Returns null if no overrides have been set.
   */
  async getStoryCustomVariables(storyId: string): Promise<Record<string, string> | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT custom_variable_values FROM stories WHERE id = ?',
      [storyId],
    )
    if (results.length === 0 || !results[0].custom_variable_values) return null
    try {
      return JSON.parse(results[0].custom_variable_values)
    } catch {
      console.error('[Database] Malformed custom_variable_values JSON for story:', storyId)
      return null
    }
  }

  /**
   * Set per-story custom variable value overrides.
   * Pass an object mapping variable names to their story-specific values.
   */
  async setStoryCustomVariables(storyId: string, values: Record<string, string>): Promise<void> {
    const db = await this.getDb()
    await db.execute('UPDATE stories SET custom_variable_values = ? WHERE id = ?', [
      JSON.stringify(values),
      storyId,
    ])
  }

  private mapVaultTag(row: any): VaultTag {
    return {
      id: row.id,
      name: row.name,
      type: row.type as VaultType,
      color: row.color,
      createdAt: row.created_at,
    }
  }

  private mapVaultScenario(row: any): VaultScenario {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      settingSeed: row.setting_seed,
      npcs: row.npcs ? JSON.parse(row.npcs) : [],
      primaryCharacterName: row.primary_character_name || '',
      firstMessage: row.first_message,
      alternateGreetings: row.alternate_greetings ? JSON.parse(row.alternate_greetings) : [],
      tags: row.tags ? JSON.parse(row.tags) : [],
      favorite: row.favorite === 1,
      source: row.source || 'import',
      originalFilename: row.original_filename,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapPack(row: any): PresetPack {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      author: row.author,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapPackTemplate(row: any): PackTemplate {
    return {
      id: row.id,
      packId: row.pack_id,
      templateId: row.template_id,
      content: row.content,
      contentHash: row.content_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapRuntimeVariable(row: any): RuntimeVariable {
    return {
      id: row.id,
      packId: row.pack_id,
      entityType: row.entity_type,
      variableName: row.variable_name,
      displayName: row.display_name,
      description: row.description ?? undefined,
      variableType: row.variable_type,
      defaultValue: row.default_value ?? undefined,
      minValue: row.min_value != null ? Number(row.min_value) : undefined,
      maxValue: row.max_value != null ? Number(row.max_value) : undefined,
      enumOptions: row.enum_options
        ? (() => {
            try {
              return JSON.parse(row.enum_options)
            } catch {
              return undefined
            }
          })()
        : undefined,
      color: row.color,
      icon: row.icon ?? undefined,
      pinned: !!row.pinned,
      sortOrder: row.sort_order ?? 0,
      createdAt: row.created_at,
    }
  }

  private mapPackVariable(row: any): CustomVariable {
    return {
      id: row.id,
      packId: row.pack_id,
      variableName: row.variable_name,
      displayName: row.display_name,
      description: row.description ?? undefined,
      variableType: row.variable_type,
      isRequired: row.is_required === 1,
      sortOrder: row.sort_order ?? 0,
      defaultValue: row.default_value ?? undefined,
      enumOptions: row.enum_options
        ? (() => {
            try {
              return JSON.parse(row.enum_options)
            } catch {
              return undefined
            }
          })()
        : undefined,
      createdAt: row.created_at,
    }
  }
}

export const database = new DatabaseService()
