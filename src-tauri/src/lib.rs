use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeSheetDraft {
    ruleset_id: String,
    stat_values: serde_json::Value,
    resource_values: serde_json::Value,
    condition_states: serde_json::Value,
    level: i64,
    xp: i64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeCharacterDraft {
    name: String,
    description: String,
    traits: Vec<String>,
    visual_descriptors: serde_json::Value,
    sheet: NativeSheetDraft,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeCharacterProposal {
    id: String,
    campaign_id: String,
    ai_player_id: String,
    character_id: Option<String>,
    proposal_type: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCharacterApprovalResult {
    character_id: String,
    revision_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeGmCharacter {
    id: String,
    name: String,
    description: Option<String>,
    traits: Vec<String>,
    visual_descriptors: serde_json::Value,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeCharacterSheet {
    character_id: String,
    ruleset_id: String,
    stat_values: serde_json::Value,
    resource_values: serde_json::Value,
    condition_states: serde_json::Value,
    level: i64,
    xp: i64,
    created_at: i64,
    updated_at: i64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeGmSheetRevision {
    id: String,
    character_id: String,
    parent_revision_id: Option<String>,
    source: String,
    snapshot: serde_json::Value,
    created_at: i64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeSetupSession {
    id: String,
    campaign_id: String,
    sequence: i64,
    title: String,
    kind: String,
    phase: String,
    status: String,
    audience: serde_json::Value,
    created_at: i64,
    started_at: Option<i64>,
    completed_at: Option<i64>,
    updated_at: i64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeSetupSessionPlayer {
    setup_session_id: String,
    ai_player_id: String,
    joined_at: i64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeInstallMigrationRequest {
    version: i64,
    description: String,
    statements: Vec<String>,
    checksum: Vec<u8>,
    previous_versions: Vec<i64>,
}

async fn open_app_database(app: &tauri::AppHandle) -> Result<sqlx::SqlitePool, String> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to get app data dir: {error}"))?
        .join("aventura-adventure.db");
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(30));
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| format!("failed to open app database: {error}"))
}

#[tauri::command]
async fn approve_character_sheet_proposal_native(
    app: tauri::AppHandle,
    proposal_json: String,
    draft_json: String,
    story_id: String,
) -> Result<NativeCharacterApprovalResult, String> {
    let proposal: NativeCharacterProposal = serde_json::from_str(&proposal_json)
        .map_err(|error| format!("invalid character proposal: {error}"))?;
    let draft: NativeCharacterDraft = serde_json::from_str(&draft_json)
        .map_err(|error| format!("invalid character draft: {error}"))?;
    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool
            .begin()
            .await
            .map_err(|error| format!("failed to begin character approval: {error}"))?;
        let character_id = proposal.character_id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| format!("system clock error: {error}"))?
            .as_millis() as i64;
        let traits = serde_json::to_string(&draft.traits).map_err(|error| error.to_string())?;
        let visual_descriptors = serde_json::to_string(&draft.visual_descriptors).map_err(|error| error.to_string())?;
        if proposal.proposal_type == "create" {
            sqlx::query(
                "INSERT INTO characters (id, story_id, name, description, relationship, traits, visual_descriptors, portrait, status, metadata, branch_id, deleted) VALUES (?, ?, ?, ?, 'party member', ?, ?, NULL, 'active', ?, NULL, 0)",
            )
            .bind(&character_id)
            .bind(&story_id)
            .bind(&draft.name)
            .bind(&draft.description)
            .bind(&traits)
            .bind(&visual_descriptors)
            .bind(serde_json::json!({ "source": "session-zero", "aiPlayerId": proposal.ai_player_id }).to_string())
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("failed to create approved character: {error}"))?;
        } else {
            sqlx::query("UPDATE characters SET name = ?, description = ?, traits = ?, visual_descriptors = ? WHERE id = ?")
                .bind(&draft.name)
                .bind(&draft.description)
                .bind(&traits)
                .bind(&visual_descriptors)
                .bind(&character_id)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("failed to update approved character: {error}"))?;
        }
        let stat_values = serde_json::to_string(&draft.sheet.stat_values).map_err(|error| error.to_string())?;
        let resource_values = serde_json::to_string(&draft.sheet.resource_values).map_err(|error| error.to_string())?;
        let condition_states = serde_json::to_string(&draft.sheet.condition_states).map_err(|error| error.to_string())?;
        sqlx::query("INSERT INTO character_sheets (character_id, ruleset_id, stat_values, resource_values, condition_states, level, xp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(character_id) DO UPDATE SET ruleset_id = excluded.ruleset_id, stat_values = excluded.stat_values, resource_values = excluded.resource_values, condition_states = excluded.condition_states, level = excluded.level, xp = excluded.xp, updated_at = excluded.updated_at")
            .bind(&character_id).bind(&draft.sheet.ruleset_id).bind(&stat_values).bind(&resource_values)
            .bind(&condition_states).bind(draft.sheet.level).bind(draft.sheet.xp).bind(now).bind(now)
            .execute(&mut *transaction).await.map_err(|error| format!("failed to save approved character sheet: {error}"))?;
        let revision_id = uuid::Uuid::new_v4().to_string();
        let parent_revision_id: Option<String> = sqlx::query_scalar("SELECT id FROM character_sheet_revisions WHERE character_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
            .bind(&character_id).fetch_optional(&mut *transaction).await.map_err(|error| format!("failed to load sheet revision: {error}"))?;
        let sheet_snapshot = serde_json::json!({
            "characterId": character_id, "rulesetId": draft.sheet.ruleset_id,
            "statValues": draft.sheet.stat_values, "resourceValues": draft.sheet.resource_values,
            "conditionStates": draft.sheet.condition_states, "level": draft.sheet.level,
            "xp": draft.sheet.xp, "createdAt": now, "updatedAt": now
        });
        sqlx::query("INSERT INTO character_sheet_revisions (id, character_id, parent_revision_id, author_type, author_ai_player_id, source, snapshot, created_at) VALUES (?, ?, ?, 'ai_player', ?, 'approved-proposal', ?, ?)")
            .bind(&revision_id).bind(&character_id).bind(parent_revision_id).bind(&proposal.ai_player_id)
            .bind(sheet_snapshot.to_string()).bind(now).execute(&mut *transaction).await
            .map_err(|error| format!("failed to save sheet revision: {error}"))?;
        sqlx::query("INSERT INTO player_characters (id, campaign_id, ai_player_id, character_id, roleplay_notes, character_secrets, inter_player_relationship_overrides, joined_at, left_at) VALUES (?, ?, ?, ?, NULL, '[]', '{}', ?, NULL) ON CONFLICT(campaign_id, ai_player_id) DO UPDATE SET character_id = excluded.character_id, left_at = NULL")
            .bind(uuid::Uuid::new_v4().to_string()).bind(&proposal.campaign_id).bind(&proposal.ai_player_id)
            .bind(&character_id).bind(now).execute(&mut *transaction).await.map_err(|error| format!("failed to assign approved character: {error}"))?;
        sqlx::query("INSERT INTO party_members (id, campaign_id, character_id, display_order, joined_at, left_at, eligibility_status, actor_category, active, narrative_control_mode, combat_control_mode) VALUES (?, ?, ?, (SELECT COUNT(*) FROM party_members WHERE campaign_id = ?), ?, NULL, 'eligible', 'active_companion', 1, 'autonomous', 'autonomous') ON CONFLICT(campaign_id, character_id) DO UPDATE SET active = 1, left_at = NULL")
            .bind(uuid::Uuid::new_v4().to_string()).bind(&proposal.campaign_id).bind(&character_id)
            .bind(&proposal.campaign_id).bind(now).execute(&mut *transaction).await.map_err(|error| format!("failed to add approved character to party: {error}"))?;
        let updated = sqlx::query("UPDATE character_sheet_proposals SET payload = ?, character_id = ?, status = 'approved', reviewed_at = ? WHERE id = ? AND status = 'pending'")
            .bind(&draft_json).bind(&character_id).bind(now).bind(&proposal.id).execute(&mut *transaction).await
            .map_err(|error| format!("failed to approve character proposal: {error}"))?;
        if updated.rows_affected() != 1 {
            return Err("character proposal is no longer pending".to_string());
        }
        transaction.commit().await.map_err(|error| format!("failed to commit character approval: {error}"))?;
        Ok(NativeCharacterApprovalResult { character_id, revision_id })
    }.await;
    pool.close().await;
    result
}

#[tauri::command]
async fn save_gm_character_sheet_edit_native(
    app: tauri::AppHandle,
    character_json: String,
    sheet_json: String,
    revision_json: String,
) -> Result<(), String> {
    let character: NativeGmCharacter = serde_json::from_str(&character_json)
        .map_err(|error| format!("invalid GM character edit: {error}"))?;
    let sheet: NativeCharacterSheet = serde_json::from_str(&sheet_json)
        .map_err(|error| format!("invalid character sheet edit: {error}"))?;
    let revision: NativeGmSheetRevision = serde_json::from_str(&revision_json)
        .map_err(|error| format!("invalid character sheet revision: {error}"))?;
    if character.id != sheet.character_id || character.id != revision.character_id {
        return Err("character, sheet, and revision IDs do not match".to_string());
    }

    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool
            .begin()
            .await
            .map_err(|error| format!("failed to begin GM character sheet edit: {error}"))?;
        sqlx::query("UPDATE characters SET name = ?, description = ?, traits = ?, visual_descriptors = ? WHERE id = ?")
            .bind(&character.name)
            .bind(&character.description)
            .bind(serde_json::to_string(&character.traits).map_err(|error| error.to_string())?)
            .bind(serde_json::to_string(&character.visual_descriptors).map_err(|error| error.to_string())?)
            .bind(&character.id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("failed to update character: {error}"))?;
        sqlx::query("INSERT INTO character_sheets (character_id, ruleset_id, stat_values, resource_values, condition_states, level, xp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(character_id) DO UPDATE SET ruleset_id = excluded.ruleset_id, stat_values = excluded.stat_values, resource_values = excluded.resource_values, condition_states = excluded.condition_states, level = excluded.level, xp = excluded.xp, updated_at = excluded.updated_at")
            .bind(&sheet.character_id)
            .bind(&sheet.ruleset_id)
            .bind(serde_json::to_string(&sheet.stat_values).map_err(|error| error.to_string())?)
            .bind(serde_json::to_string(&sheet.resource_values).map_err(|error| error.to_string())?)
            .bind(serde_json::to_string(&sheet.condition_states).map_err(|error| error.to_string())?)
            .bind(sheet.level)
            .bind(sheet.xp)
            .bind(sheet.created_at)
            .bind(sheet.updated_at)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("failed to save character sheet: {error}"))?;
        sqlx::query("INSERT INTO character_sheet_revisions (id, character_id, parent_revision_id, author_type, author_ai_player_id, source, snapshot, created_at) VALUES (?, ?, ?, 'gm', NULL, ?, ?, ?)")
            .bind(&revision.id)
            .bind(&revision.character_id)
            .bind(&revision.parent_revision_id)
            .bind(&revision.source)
            .bind(serde_json::to_string(&revision.snapshot).map_err(|error| error.to_string())?)
            .bind(revision.created_at)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("failed to save character sheet revision: {error}"))?;
        transaction
            .commit()
            .await
            .map_err(|error| format!("failed to commit GM character sheet edit: {error}"))?;
        Ok(())
    }
    .await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_campaign_setup_session_native(
    app: tauri::AppHandle,
    session_json: String,
    participants_json: String,
) -> Result<(), String> {
    let session: NativeSetupSession = serde_json::from_str(&session_json)
        .map_err(|error| format!("invalid setup session: {error}"))?;
    let participants: Vec<NativeSetupSessionPlayer> = serde_json::from_str(&participants_json)
        .map_err(|error| format!("invalid setup session participants: {error}"))?;
    if participants
        .iter()
        .any(|participant| participant.setup_session_id != session.id)
    {
        return Err("setup session participant references a different session".to_string());
    }

    let audience_scope = session
        .audience
        .get("kind")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "setup session audience kind is required".to_string())?;
    let audience_ids = match audience_scope {
        "private_player" => vec![session
            .audience
            .get("aiPlayerId")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "private setup session audience requires an AI player".to_string())?
            .to_string()],
        "player_subset" => session
            .audience
            .get("aiPlayerIds")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| "setup session player subset is invalid".to_string())?
            .iter()
            .map(|value| {
                value.as_str().map(str::to_string).ok_or_else(|| {
                    "setup session audience contains an invalid AI player".to_string()
                })
            })
            .collect::<Result<Vec<_>, _>>()?,
        "full_table" => participants
            .iter()
            .map(|participant| participant.ai_player_id.clone())
            .collect(),
        _ => {
            return Err(format!(
                "unsupported setup session audience: {audience_scope}"
            ))
        }
    };

    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool
            .begin()
            .await
            .map_err(|error| format!("failed to begin setup session creation: {error}"))?;
        sqlx::query("INSERT INTO campaign_setup_sessions (id, campaign_id, sequence, title, kind, phase, status, audience_scope, audience_ai_player_ids, created_at, started_at, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(&session.id)
            .bind(&session.campaign_id)
            .bind(session.sequence)
            .bind(&session.title)
            .bind(&session.kind)
            .bind(&session.phase)
            .bind(&session.status)
            .bind(audience_scope)
            .bind(serde_json::to_string(&audience_ids).map_err(|error| error.to_string())?)
            .bind(session.created_at)
            .bind(session.started_at)
            .bind(session.completed_at)
            .bind(session.updated_at)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("failed to create setup session: {error}"))?;
        for participant in participants {
            sqlx::query("INSERT INTO campaign_setup_session_players (setup_session_id, ai_player_id, joined_at) VALUES (?, ?, ?)")
                .bind(participant.setup_session_id)
                .bind(participant.ai_player_id)
                .bind(participant.joined_at)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("failed to add setup session participant: {error}"))?;
        }
        transaction
            .commit()
            .await
            .map_err(|error| format!("failed to commit setup session creation: {error}"))?;
        Ok(())
    }
    .await;
    pool.close().await;
    result
}

async fn update_runtime_variable_entities(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    story_ids: &[String],
    variable_id: &str,
    new_variable_name: Option<&str>,
) -> Result<(), String> {
    if story_ids.is_empty() {
        return Ok(());
    }
    let placeholders = std::iter::repeat_n("?", story_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let value_path = format!("$.runtimeVars.{variable_id}");
    let name_path = format!("{value_path}.variableName");
    for table in ["characters", "locations", "items", "story_beats"] {
        let sql = if new_variable_name.is_some() {
            format!("UPDATE {table} SET metadata = json_set(metadata, ?, ?) WHERE story_id IN ({placeholders}) AND json_extract(metadata, ?) IS NOT NULL")
        } else {
            format!("UPDATE {table} SET metadata = json_remove(metadata, ?) WHERE story_id IN ({placeholders}) AND json_extract(metadata, ?) IS NOT NULL")
        };
        let mut query = sqlx::query(&sql).bind(if new_variable_name.is_some() {
            &name_path
        } else {
            &value_path
        });
        if let Some(variable_name) = new_variable_name {
            query = query.bind(variable_name);
        }
        for story_id in story_ids {
            query = query.bind(story_id);
        }
        query
            .bind(&value_path)
            .execute(&mut **transaction)
            .await
            .map_err(|error| {
                format!("failed to update runtime variable values in {table}: {error}")
            })?;
    }
    Ok(())
}

async fn runtime_variable_story_ids(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    pack_id: &str,
) -> Result<Vec<String>, String> {
    sqlx::query_scalar("SELECT id FROM stories WHERE pack_id = ?")
        .bind(pack_id)
        .fetch_all(&mut **transaction)
        .await
        .map_err(|error| format!("failed to load stories using prompt pack: {error}"))
}

#[tauri::command]
async fn delete_runtime_variable_native(
    app: tauri::AppHandle,
    pack_id: String,
    variable_id: String,
) -> Result<(), String> {
    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
        let story_ids = runtime_variable_story_ids(&mut transaction, &pack_id).await?;
        update_runtime_variable_entities(&mut transaction, &story_ids, &variable_id, None).await?;
        sqlx::query("DELETE FROM pack_runtime_variables WHERE id = ? AND pack_id = ?")
            .bind(&variable_id)
            .bind(&pack_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("failed to delete runtime variable: {error}"))?;
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())
    }
    .await;
    pool.close().await;
    result
}

#[tauri::command]
async fn rename_runtime_variable_native(
    app: tauri::AppHandle,
    pack_id: String,
    variable_id: String,
    new_variable_name: String,
) -> Result<(), String> {
    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
        let story_ids = runtime_variable_story_ids(&mut transaction, &pack_id).await?;
        sqlx::query(
            "UPDATE pack_runtime_variables SET variable_name = ? WHERE id = ? AND pack_id = ?",
        )
        .bind(&new_variable_name)
        .bind(&variable_id)
        .bind(&pack_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("failed to rename runtime variable: {error}"))?;
        update_runtime_variable_entities(
            &mut transaction,
            &story_ids,
            &variable_id,
            Some(&new_variable_name),
        )
        .await?;
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())
    }
    .await;
    pool.close().await;
    result
}

#[tauri::command]
async fn change_runtime_variable_type_native(
    app: tauri::AppHandle,
    pack_id: String,
    variable_id: String,
    variable_type: String,
) -> Result<(), String> {
    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
        let story_ids = runtime_variable_story_ids(&mut transaction, &pack_id).await?;
        update_runtime_variable_entities(&mut transaction, &story_ids, &variable_id, None).await?;
        sqlx::query("UPDATE pack_runtime_variables SET variable_type = ?, default_value = NULL, min_value = NULL, max_value = NULL, enum_options = NULL WHERE id = ? AND pack_id = ?")
            .bind(&variable_type)
            .bind(&variable_id)
            .bind(&pack_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("failed to change runtime variable type: {error}"))?;
        transaction.commit().await.map_err(|error| error.to_string())
    }.await;
    pool.close().await;
    result
}

#[tauri::command]
async fn reorder_runtime_variables_native(
    app: tauri::AppHandle,
    first_id: String,
    first_sort_order: i64,
    second_id: String,
    second_sort_order: i64,
) -> Result<(), String> {
    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
        for (id, sort_order) in [
            (&first_id, first_sort_order),
            (&second_id, second_sort_order),
        ] {
            sqlx::query("UPDATE pack_runtime_variables SET sort_order = ? WHERE id = ?")
                .bind(sort_order)
                .bind(id)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("failed to reorder runtime variable: {error}"))?;
        }
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())
    }
    .await;
    pool.close().await;
    result
}

#[tauri::command]
async fn convert_campaign_to_party_pending_native(
    app: tauri::AppHandle,
    campaign_id: String,
    story_id: String,
    required_ai_player_ids_json: String,
    backup_id: String,
    snapshot_json: String,
    checksum: String,
    created_at: i64,
) -> Result<(), String> {
    let required_ai_player_ids: Vec<String> = serde_json::from_str(&required_ai_player_ids_json)
        .map_err(|error| format!("invalid required AI player IDs: {error}"))?;
    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
        let campaign_type: Option<String> = sqlx::query_scalar(
            "SELECT campaign_type FROM campaigns WHERE id = ? AND story_id = ?",
        )
        .bind(&campaign_id)
        .bind(&story_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| format!("failed to load campaign: {error}"))?;
        if !matches!(campaign_type.as_deref(), Some("human_gm_ai_players" | "human_gm_solo")) {
            return Err("Only Human GM campaigns can be converted to party pending".to_string());
        }
        sqlx::query("INSERT INTO campaign_formation_backups (id, campaign_id, snapshot, checksum, created_at, restored_at) VALUES (?, ?, ?, ?, ?, NULL)")
            .bind(&backup_id).bind(&campaign_id).bind(&snapshot_json).bind(&checksum).bind(created_at)
            .execute(&mut *transaction).await.map_err(|error| format!("failed to save formation backup: {error}"))?;
        for sql in [
            "DELETE FROM session_prerolls WHERE session_id IN (SELECT id FROM campaign_sessions WHERE campaign_id = ?)",
            "DELETE FROM campaign_chat_messages WHERE campaign_id = ? AND session_id IS NOT NULL",
            "DELETE FROM ai_player_proposals WHERE campaign_id = ?",
            "DELETE FROM ai_player_interactions WHERE campaign_id = ?",
            "DELETE FROM roll_ledger WHERE campaign_id = ?",
            "DELETE FROM session_party_members WHERE session_id IN (SELECT id FROM campaign_sessions WHERE campaign_id = ?)",
            "DELETE FROM campaign_sessions WHERE campaign_id = ?",
            "DELETE FROM player_characters WHERE campaign_id = ?",
            "DELETE FROM actor_control_profiles WHERE campaign_id = ?",
            "DELETE FROM party_members WHERE campaign_id = ?",
        ] {
            sqlx::query(sql).bind(&campaign_id).execute(&mut *transaction).await
                .map_err(|error| format!("failed to clear campaign formation data: {error}"))?;
        }
        for sql in [
            "DELETE FROM character_sheet_revisions WHERE character_id IN (SELECT id FROM characters WHERE story_id = ?)",
            "DELETE FROM character_sheets WHERE character_id IN (SELECT id FROM characters WHERE story_id = ?)",
            "DELETE FROM entries WHERE story_id = ? AND type = 'character'",
            "DELETE FROM characters WHERE story_id = ?",
        ] {
            sqlx::query(sql).bind(&story_id).execute(&mut *transaction).await
                .map_err(|error| format!("failed to clear campaign character data: {error}"))?;
        }
        sqlx::query("UPDATE campaigns SET spotlight_character_id = NULL, campaign_type = 'human_gm_ai_players', updated_at = ? WHERE id = ?")
            .bind(created_at).bind(&campaign_id).execute(&mut *transaction).await
            .map_err(|error| format!("failed to update campaign type: {error}"))?;
        sqlx::query("INSERT INTO campaign_formation_state (campaign_id, status, required_ai_player_ids, source, created_at, updated_at) VALUES (?, 'party_pending', ?, 'converted', ?, ?) ON CONFLICT(campaign_id) DO UPDATE SET status = 'party_pending', required_ai_player_ids = excluded.required_ai_player_ids, source = 'converted', updated_at = excluded.updated_at")
            .bind(&campaign_id)
            .bind(serde_json::to_string(&required_ai_player_ids).map_err(|error| error.to_string())?)
            .bind(created_at).bind(created_at).execute(&mut *transaction).await
            .map_err(|error| format!("failed to save party-pending state: {error}"))?;
        transaction.commit().await.map_err(|error| format!("failed to commit campaign conversion: {error}"))
    }.await;
    pool.close().await;
    result
}

async fn insert_formation_rows(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    table: &str,
    rows: &[serde_json::Value],
) -> Result<(), String> {
    for row in rows {
        let values = row
            .as_object()
            .ok_or_else(|| format!("invalid {table} backup row"))?;
        if values.is_empty() {
            continue;
        }
        if values.keys().any(|column| {
            !column
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        }) {
            return Err(format!("invalid column in {table} backup"));
        }
        let columns = values.keys().cloned().collect::<Vec<_>>();
        let placeholders = std::iter::repeat_n("?", columns.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO {table} ({}) VALUES ({placeholders})",
            columns.join(", ")
        );
        let mut query = sqlx::query(&sql);
        for column in columns {
            query = match &values[&column] {
                serde_json::Value::Null => query.bind(Option::<String>::None),
                serde_json::Value::Bool(value) => query.bind(*value),
                serde_json::Value::Number(value) if value.is_i64() => query.bind(value.as_i64()),
                serde_json::Value::Number(value) if value.is_u64() => {
                    query.bind(value.as_u64().map(|number| number as i64))
                }
                serde_json::Value::Number(value) => query.bind(value.as_f64()),
                serde_json::Value::String(value) => query.bind(value),
                value => query.bind(value.to_string()),
            };
        }
        query
            .execute(&mut **transaction)
            .await
            .map_err(|error| format!("failed to restore {table}: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn restore_campaign_formation_backup_native(
    app: tauri::AppHandle,
    backup_id: String,
    snapshot_json: String,
    checksum: String,
    restored_at: i64,
) -> Result<(), String> {
    let snapshot: serde_json::Value = serde_json::from_str(&snapshot_json)
        .map_err(|error| format!("invalid formation snapshot: {error}"))?;
    let campaign_id = snapshot
        .get("campaignId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "formation snapshot campaign ID is missing".to_string())?;
    let story_id = snapshot
        .get("storyId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "formation snapshot story ID is missing".to_string())?;
    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
        let stored: Option<(String, String, Option<i64>)> = sqlx::query_as(
            "SELECT snapshot, checksum, restored_at FROM campaign_formation_backups WHERE id = ?",
        ).bind(&backup_id).fetch_optional(&mut *transaction).await
            .map_err(|error| format!("failed to load formation backup: {error}"))?;
        let Some((stored_snapshot, stored_checksum, previous_restore)) = stored else {
            return Err("Campaign formation backup not found".to_string());
        };
        if stored_snapshot != snapshot_json || stored_checksum != checksum {
            return Err("Campaign formation backup changed during validation".to_string());
        }
        let live_characters: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM characters WHERE story_id = ?").bind(story_id).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
        let normal_sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM campaign_sessions WHERE campaign_id = ?").bind(campaign_id).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
        let setup_sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM campaign_setup_sessions WHERE campaign_id = ?").bind(campaign_id).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
        if previous_restore.is_some() || live_characters != 0 || normal_sessions != 0 || setup_sessions != 0 {
            return Err("Backup cannot be restored after replacement cast or play has begun".to_string());
        }
        let tables = snapshot.get("tables").and_then(serde_json::Value::as_object)
            .ok_or_else(|| "formation snapshot tables are missing".to_string())?;
        for table in ["characters", "entries", "character_sheets", "character_sheet_revisions", "party_members", "actor_control_profiles", "player_characters", "campaign_sessions", "session_party_members", "campaign_chat_messages", "ai_player_proposals", "ai_player_interactions", "roll_ledger", "session_prerolls"] {
            let rows = tables.get(table).and_then(serde_json::Value::as_array).map(Vec::as_slice).unwrap_or(&[]);
            insert_formation_rows(&mut transaction, table, rows).await?;
        }
        if let Some(ownership_rows) = snapshot.get("itemOwnership").and_then(serde_json::Value::as_array) {
            for ownership in ownership_rows {
                sqlx::query("UPDATE items SET owner_character_id = ?, slot_key = ?, container_item_id = ? WHERE id = ?")
                    .bind(ownership.get("owner_character_id").and_then(serde_json::Value::as_str))
                    .bind(ownership.get("slot_key").and_then(serde_json::Value::as_str))
                    .bind(ownership.get("container_item_id").and_then(serde_json::Value::as_str))
                    .bind(ownership.get("id").and_then(serde_json::Value::as_str))
                    .execute(&mut *transaction).await.map_err(|error| format!("failed to restore item ownership: {error}"))?;
            }
        }
        if let Some(campaign) = tables.get("campaigns").and_then(serde_json::Value::as_array).and_then(|rows| rows.first()) {
            sqlx::query("UPDATE campaigns SET campaign_type = ?, spotlight_character_id = ?, updated_at = ? WHERE id = ?")
                .bind(campaign.get("campaign_type").and_then(serde_json::Value::as_str))
                .bind(campaign.get("spotlight_character_id").and_then(serde_json::Value::as_str))
                .bind(restored_at).bind(campaign_id).execute(&mut *transaction).await
                .map_err(|error| format!("failed to restore campaign: {error}"))?;
        }
        sqlx::query("DELETE FROM campaign_formation_state WHERE campaign_id = ?").bind(campaign_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        let state_rows = tables.get("campaign_formation_state").and_then(serde_json::Value::as_array).map(Vec::as_slice).unwrap_or(&[]);
        insert_formation_rows(&mut transaction, "campaign_formation_state", state_rows).await?;
        sqlx::query("UPDATE campaign_formation_backups SET restored_at = ? WHERE id = ?").bind(restored_at).bind(&backup_id).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
        transaction.commit().await.map_err(|error| format!("failed to commit formation restore: {error}"))
    }.await;
    pool.close().await;
    result
}

#[tauri::command]
async fn install_migration_native(
    app: tauri::AppHandle,
    request_json: String,
) -> Result<(), String> {
    let request: NativeInstallMigrationRequest = serde_json::from_str(&request_json)
        .map_err(|error| format!("invalid migration request: {error}"))?;
    let pool = open_app_database(&app).await?;
    let result = async {
        let mut transaction = pool.begin().await.map_err(|error| format!("failed to begin migration: {error}"))?;
        let applied: Vec<(i64, bool)> = sqlx::query_as("SELECT version, success FROM _sqlx_migrations")
            .fetch_all(&mut *transaction).await
            .map_err(|error| format!("failed to inspect migration ledger: {error}"))?;
        if applied.iter().any(|(version, success)| *version == request.version && *success) {
            return Err(format!("Migration {} is already marked as applied", request.version));
        }
        let missing_previous = request.previous_versions.iter()
            .filter(|required| !applied.iter().any(|(version, success)| version == *required && *success))
            .copied().collect::<Vec<_>>();
        if !missing_previous.is_empty() {
            return Err(format!("Migration {} cannot be installed out of order. Missing prerequisite migration(s): {}", request.version, missing_previous.iter().map(i64::to_string).collect::<Vec<_>>().join(", ")));
        }
        sqlx::query("DELETE FROM _sqlx_migrations WHERE version = ? AND success = 0")
            .bind(request.version).execute(&mut *transaction).await
            .map_err(|error| format!("failed to clear failed migration record: {error}"))?;
        let started_at = std::time::Instant::now();
        for statement in &request.statements {
            sqlx::query(statement).execute(&mut *transaction).await
                .map_err(|error| format!("failed to execute migration {}: {error}", request.version))?;
        }
        sqlx::query("INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) VALUES (?, ?, datetime('now'), 1, ?, ?)")
            .bind(request.version).bind(&request.description).bind(&request.checksum)
            .bind(started_at.elapsed().as_millis() as i64).execute(&mut *transaction).await
            .map_err(|error| format!("failed to record migration: {error}"))?;
        transaction.commit().await.map_err(|error| format!("failed to commit migration: {error}"))
    }.await;
    pool.close().await;
    result
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

    fs::create_dir_all(&app_data_dir).map_err(|e| {
        format!(
            "failed to create app data dir {}: {e}",
            app_data_dir.display()
        )
    })?;

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
        Migration {
            version: 58,
            description: "ai_players_foundation",
            sql: include_str!("../migrations/058_ai_players_foundation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 59,
            description: "ability_scene_relevance",
            sql: include_str!("../migrations/059_ability_scene_relevance.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 60,
            description: "worldbuilding_workspace",
            sql: include_str!("../migrations/060_worldbuilding_workspace.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 61,
            description: "ai_player_proposals",
            sql: include_str!("../migrations/061_ai_player_proposals.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 62,
            description: "campaign_type_and_table_talk",
            sql: include_str!("../migrations/062_campaign_type_and_table_talk.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 63,
            description: "campaign_chat_messages",
            sql: include_str!("../migrations/063_campaign_chat_messages.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 64,
            description: "campaign_session_zero_state",
            sql: include_str!("../migrations/064_campaign_session_zero_state.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 65,
            description: "campaign_session_zero_status",
            sql: include_str!("../migrations/065_campaign_session_zero_status.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 66,
            description: "campaign_ai_player_roster",
            sql: include_str!("../migrations/066_campaign_ai_player_roster.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 67,
            description: "character_sheet_revisions",
            sql: include_str!("../migrations/067_character_sheet_revisions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 68,
            description: "campaign_formation_setup_sessions",
            sql: include_str!("../migrations/068_campaign_formation_setup_sessions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 69,
            description: "character_sheet_proposals",
            sql: include_str!("../migrations/069_character_sheet_proposals.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 70,
            description: "ai_player_memories",
            sql: include_str!("../migrations/070_ai_player_memories.sql"),
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
            approve_character_sheet_proposal_native,
            save_gm_character_sheet_edit_native,
            create_campaign_setup_session_native,
            delete_runtime_variable_native,
            rename_runtime_variable_native,
            change_runtime_variable_type_native,
            reorder_runtime_variables_native,
            convert_campaign_to_party_pending_native,
            restore_campaign_formation_backup_native,
            install_migration_native,
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
