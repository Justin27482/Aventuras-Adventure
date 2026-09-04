export interface MigrationCatalogEntry {
  version: number
  filename: string
  description: string
  sql: string
  affectedObjects: string[]
}

const rawMigrations = import.meta.glob<string>('../../../../src-tauri/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const migrationDescriptions: Record<number, string> = {
  1: 'create_initial_tables',
  2: 'add_chapters_checkpoints_mode',
  3: 'add_entries_lorebook',
  4: 'add_entry_lore_blacklist',
  5: 'add_story_beats_resolved_at',
  6: 'add_story_retry_state',
  7: 'add_story_style_review_state',
  8: 'add_story_time_tracker',
  9: 'add_checkpoint_time_tracker',
  10: 'add_chapter_time_fields',
  11: 'add_image_generation',
  12: 'add_character_portraits',
  13: 'add_branches',
  14: 'fix_branch_fk',
  15: 'branch_world_state',
  16: 'character_vault',
  17: 'lorebook_vault',
  18: 'scenario_vault',
  19: 'settings',
  20: 'prompt_packs',
  21: 'prompt_pack_templates',
  22: 'prompt_pack_variables',
  23: 'prompt_pack_runtime_variables',
  24: 'story_custom_variables',
  25: 'story_pack',
  26: 'model_health_cache',
  27: 'vault_conversations',
  28: 'vault_tags',
  29: 'vault_metadata',
  30: 'story_sources',
  31: 'story_folders',
  32: 'runtime_variables',
  33: 'vault_assistant_conversations',
  34: 'model_health_cache_v2',
  35: 'entry_versions',
  36: 'story_folders',
  37: 'epistemic_secret_atoms',
  38: 'epistemic_character_knowledge_edges',
  39: 'director_assistant_artifacts',
  40: 'campaign_foundation',
  41: 'campaign_agency_sessions',
  42: 'item_ownership',
  43: 'companion_combat_policy',
  44: 'editor_assistant_conversations',
  45: 'chapter_sources',
  46: 'ruleset_foundation',
  47: 'roll_ledger',
  48: 'character_sheets',
  49: 'scene_turn_state',
  50: 'campaign_threads',
  51: 'thread_beats_clocks',
  52: 'gm_persona',
  53: 'campaign_intensity_scale',
  54: 'ruleset_spells_creatures',
  55: 'ruleset_encumbrance',
  56: 'slot_capacity_configuration',
  57: 'entry_ability_link',
  58: 'ai_players_foundation',
  59: 'ability_scene_relevance',
  60: 'worldbuilding_workspace',
  61: 'ai_player_proposals',
  62: 'campaign_type_and_table_talk',
  63: 'campaign_chat_messages',
  64: 'campaign_session_zero_state',
  65: 'campaign_session_zero_status',
  66: 'campaign_ai_player_roster',
  67: 'character_sheet_revisions',
  68: 'campaign_formation_setup_sessions',
  69: 'character_sheet_proposals',
  70: 'ai_player_memories',
}

function affectedObjects(sql: string): string[] {
  const objects = new Set<string>()
  const pattern = /(?:TABLE|INDEX|TRIGGER|VIEW)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([`\w]+)/gi
  for (const match of sql.matchAll(pattern)) objects.add(match[1].replaceAll('`', ''))
  return [...objects]
}

export const MIGRATION_CATALOG: MigrationCatalogEntry[] = Object.entries(rawMigrations)
  .map(([path, sql]) => {
    const filename = path.split('/').pop() ?? path
    const version = Number(filename.match(/^(\d+)/)?.[1] ?? 0)
    return {
      version,
      filename,
      description: migrationDescriptions[version] ?? filename.replace(/^\d+_/, '').replace(/\.sql$/, ''),
      sql,
      affectedObjects: affectedObjects(sql),
    }
  })
  .filter((migration) => migration.version > 0)
  .sort((a, b) => a.version - b.version)
