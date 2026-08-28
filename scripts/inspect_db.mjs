import Database from 'better-sqlite3'

const db = new Database(
  'C:/Users/jvert/AppData/Roaming/com.karelian.aventura.adventure/aventura-adventure.db',
  { readonly: true },
)

console.log('\n=== TABLES ===')
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log(tables.map((t) => t.name).join('\n'))

console.log('\n=== Stories matching Brightness Dimmed ===')
const stories = db
  .prepare("SELECT id, title, mode, created_at FROM stories WHERE title LIKE '%Brightness%'")
  .all()
console.log(JSON.stringify(stories, null, 2))

if (stories.length > 0) {
  const storyId = stories[0].id
  console.log('\n=== Campaigns for story ===')
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE story_id = ?').all(storyId)
  console.log(JSON.stringify(campaigns, null, 2))

  if (campaigns.length > 0) {
    const campaignId = campaigns[0].id
    console.log('\n=== Campaign Settings ===')
    const settings = db
      .prepare('SELECT * FROM campaign_settings WHERE campaign_id = ?')
      .all(campaignId)
    console.log(JSON.stringify(settings, null, 2))

    console.log('\n=== Party Members ===')
    const party = db
      .prepare('SELECT * FROM campaign_party_members WHERE campaign_id = ?')
      .all(campaignId)
    console.log(JSON.stringify(party, null, 2))
  }
}

console.log('\n=== Characters for story ===')
if (stories.length > 0) {
  const chars = db
    .prepare('SELECT id, story_id, name, role FROM characters WHERE story_id = ?')
    .all(stories[0].id)
  console.log(JSON.stringify(chars, null, 2))
}

db.close()
