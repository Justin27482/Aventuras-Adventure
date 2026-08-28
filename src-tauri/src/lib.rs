use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use std::fs;
use std::path::PathBuf;

mod migration_patch;
mod sync;

use sync::commands::{
    clear_received_stories, get_received_stories, start_sync_server, stop_sync_server,
    sync_connect, sync_pull_story, sync_push_story,
};

#[derive(serde::Serialize)]
struct SplitDatabaseBootstrapResult {
    status: String,
    imported: bool,
    target_path: String,
    legacy_path: Option<String>,
    stories_before: i64,
    stories_after: i64,
    stories_removed: i64,
}

#[tauri::command]
async fn bootstrap_split_database(
    app: tauri::AppHandle,
    mode: String,
) -> Result<SplitDatabaseBootstrapResult, String> {
    let import_mode = mode.trim();
    if import_mode != "creative-writing" && import_mode != "adventure" {
        return Err(format!("unsupported mode: {import_mode}"));
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to get app data dir: {e}"))?;

    let target_db_path = app_data_dir.join("aventura-adventure.db");

    if target_db_path.exists() {
        return Ok(SplitDatabaseBootstrapResult {
            status: "target_exists".to_string(),
            imported: false,
            target_path: target_db_path.display().to_string(),
            legacy_path: None,
            stories_before: 0,
            stories_after: 0,
            stories_removed: 0,
        });
    }

    let mut legacy_candidates: Vec<PathBuf> = vec![app_data_dir.join("aventura.db")];
    if let Some(parent) = app_data_dir.parent() {
        legacy_candidates.push(parent.join("com.karelian.aventura").join("aventura.db"));
    }

    let legacy_db_path = legacy_candidates.into_iter().find(|p| p.exists());

    let Some(legacy_db_path) = legacy_db_path else {
        return Ok(SplitDatabaseBootstrapResult {
            status: "no_legacy_db_found".to_string(),
            imported: false,
            target_path: target_db_path.display().to_string(),
            legacy_path: None,
            stories_before: 0,
            stories_after: 0,
            stories_removed: 0,
        });
    };

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("failed to create app data dir {}: {e}", app_data_dir.display()))?;

    fs::copy(&legacy_db_path, &target_db_path).map_err(|e| {
        format!(
            "failed to copy legacy db from {} to {}: {e}",
            legacy_db_path.display(),
            target_db_path.display()
        )
    })?;

    let db_url = format!("sqlite:{}", target_db_path.display());
    let pool = sqlx::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("failed to open copied db: {e}"))?;

    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await
        .map_err(|e| format!("failed to enable foreign keys: {e}"))?;

    let stories_before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stories")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("failed to count stories before filtering: {e}"))?;

    sqlx::query("DELETE FROM stories WHERE COALESCE(mode, 'adventure') != ?")
        .bind(import_mode)
        .execute(&pool)
        .await
        .map_err(|e| format!("failed to filter stories by mode: {e}"))?;

    let stories_after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stories")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("failed to count stories after filtering: {e}"))?;

    pool.close().await;

    Ok(SplitDatabaseBootstrapResult {
        status: "imported".to_string(),
        imported: true,
        target_path: target_db_path.display().to_string(),
        legacy_path: Some(legacy_db_path.display().to_string()),
        stories_before,
        stories_after,
        stories_removed: stories_before.saturating_sub(stories_after),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_chapters_checkpoints_mode",
            sql: include_str!("../migrations/002_chapters_checkpoints.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_entries_lorebook",
            sql: include_str!("../migrations/003_entries.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_entry_lore_blacklist",
            sql: include_str!("../migrations/004_entry_lore_blacklist.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_story_beats_resolved_at",
            sql: include_str!("../migrations/005_story_beats_resolved_at.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_story_retry_state",
            sql: include_str!("../migrations/006_story_retry_state.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_story_style_review_state",
            sql: include_str!("../migrations/007_story_style_review_state.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_story_time_tracker",
            sql: include_str!("../migrations/008_story_time_tracker.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_checkpoint_time_tracker",
            sql: include_str!("../migrations/009_checkpoint_time_tracker.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_chapter_time_fields",
            sql: include_str!("../migrations/010_chapter_time_fields.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_image_generation",
            sql: include_str!("../migrations/011_image_generation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_character_portraits",
            sql: include_str!("../migrations/012_character_portraits.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add_branches",
            sql: include_str!("../migrations/013_branches.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "fix_branch_fk",
            sql: include_str!("../migrations/014_fix_branch_fk.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "branch_world_state",
            sql: include_str!("../migrations/015_branch_world_state.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "character_vault",
            sql: include_str!("../migrations/016_character_vault.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "lorebook_vault",
            sql: include_str!("../migrations/017_lorebook_vault.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "scenario_vault",
            sql: include_str!("../migrations/018_scenario_vault.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "entry_reasoning",
            sql: include_str!("../migrations/019_entry_reasoning.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "migrate_legacy_prompts",
            sql: include_str!("../migrations/020_migrate_legacy_prompts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "translation",
            sql: include_str!("../migrations/021_translation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "vault_tags",
            sql: include_str!("../migrations/022_vault_tags.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "simplify_character_vault",
            sql: include_str!("../migrations/023_simplify_character_vault.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "story_bg_image",
            sql: include_str!("../migrations/024_background_images.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "world_state_deltas",
            sql: include_str!("../migrations/025_world_state_deltas.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "cow_branches",
            sql: include_str!("../migrations/026_cow_branches.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "entry_suggested_actions",
            sql: include_str!("../migrations/027_entry_suggested_actions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "cow_tombstones",
            sql: include_str!("../migrations/028_cow_tombstones.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "branch_entity_snapshots",
            sql: include_str!("../migrations/029_branch_entity_snapshots.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 30,
            description: "preset_packs",
            sql: include_str!("../migrations/030_preset_packs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 31,
            description: "pack_variable_extensions",
            sql: include_str!("../migrations/031_pack_variable_extensions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 32,
            description: "runtime_variables",
            sql: include_str!("../migrations/032_runtime_variables.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 33,
            description: "vault_assistant_conversations",
            sql: include_str!("../migrations/033_vault_assistant_conversations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 34,
            description: "model_health_cache",
            sql: include_str!("../migrations/034_model_health_cache.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 35,
            description: "entry_versions",
            sql: include_str!("../migrations/035_entry_versions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 36,
            description: "story_folders",
            sql: include_str!("../migrations/036_story_folders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 37,
            description: "epistemic_secret_atoms",
            sql: include_str!("../migrations/037_epistemic_secret_atoms.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 38,
            description: "epistemic_character_knowledge_edges",
            sql: include_str!("../migrations/038_character_knowledge_edges.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 39,
            description: "director_assistant_artifacts",
            sql: include_str!("../migrations/039_director_assistant_artifacts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 40,
            description: "campaign_foundation",
            sql: include_str!("../migrations/040_campaign_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 41,
            description: "campaign_agency_sessions",
            sql: include_str!("../migrations/041_campaign_agency_sessions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 42,
            description: "item_ownership_stash",
            sql: include_str!("../migrations/042_item_ownership_stash.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 43,
            description: "companion_combat_policy",
            sql: include_str!("../migrations/043_companion_combat_policy.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 44,
            description: "editor_assistant_conversations",
            sql: include_str!("../migrations/044_editor_assistant_conversations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 45,
            description: "chapter_sources",
            sql: include_str!("../migrations/045_chapter_sources.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 46,
            description: "ruleset_foundation",
            sql: include_str!("../migrations/046_ruleset_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 47,
            description: "roll_ledger",
            sql: include_str!("../migrations/047_roll_ledger.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 48,
            description: "character_sheets",
            sql: include_str!("../migrations/048_character_sheets.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 49,
            description: "scene_turn_state",
            sql: include_str!("../migrations/049_scene_turn_state.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 50,
            description: "campaign_threads",
            sql: include_str!("../migrations/050_campaign_threads.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 51,
            description: "thread_beats_clocks",
            sql: include_str!("../migrations/051_thread_beats_clocks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 52,
            description: "gm_persona",
            sql: include_str!("../migrations/052_gm_persona.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 53,
            description: "campaign_intensity_scale",
            sql: include_str!("../migrations/053_campaign_intensity_scale.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 54,
            description: "ruleset_spells_creatures",
            sql: include_str!("../migrations/054_ruleset_spells_creatures.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 55,
            description: "ruleset_encumbrance",
            sql: include_str!("../migrations/055_ruleset_encumbrance.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 56,
            description: "slot_capacity_configuration",
            sql: include_str!("../migrations/056_slot_capacity_configuration.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 57,
            description: "entry_ability_link",
            sql: include_str!("../migrations/057_entry_ability_link.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default();

    #[cfg(all(debug_assertions, feature = "devtools"))]
    // only enable instrumentation in development builds
    {
        builder = builder.plugin(tauri_plugin_devtools::init());
    }

    builder
        .manage(sync::SyncState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:aventura-adventure.db", migrations)
                .build(),
        )
        .setup(|app| {
            let db_path = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir")
                .join("aventura-adventure.db");

            if db_path.try_exists().expect("failed to check db path") {
                tauri::async_runtime::block_on(migration_patch::apply_checksum_patch(&db_path));
            }

            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            start_sync_server,
            stop_sync_server,
            get_received_stories,
            clear_received_stories,
            sync_connect,
            sync_pull_story,
            sync_push_story,
            bootstrap_split_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
