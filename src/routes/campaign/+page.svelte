<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import GMCampaignScreen from '$lib/components/campaign/GMCampaignScreen.svelte'
  import { CampaignTypeService } from '$lib/services/campaign/campaign-type-service'
  import { onMount } from 'svelte'

  /**
   * Campaign main route
   * Routes to appropriate screen based on campaign type
   */

  let isLoading = $state(true)
  let error: string | null = $state(null)

  onMount(async () => {
    try {
      // Ensure campaign is loaded
      if (!campaign.current) {
        error = 'No campaign loaded'
        return
      }

      const campaignType = CampaignTypeService.getCampaignType(campaign.current)

      // For now, all GM campaigns use GMCampaignScreen
      // Later, 'ai_gm' and 'human_player' will route differently
      if (CampaignTypeService.usesGMCampaignUI(campaignType)) {
        // Load campaign data
        if (campaign.current.storyId) {
          await campaign.loadForStory(campaign.current.storyId)
        }
      } else {
        error = `Campaign type '${campaignType}' not yet implemented`
      }
    } catch (e) {
      error = `Failed to load campaign: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      isLoading = false
    }
  })
</script>

<div class="campaign-page">
  {#if isLoading}
    <div class="loading">
      <p>Loading campaign...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>⚠️ {error}</p>
      <a href="/">← Back Home</a>
    </div>
  {:else}
    <GMCampaignScreen />
  {/if}
</div>

<style>
  .campaign-page {
    display: flex;
    width: 100%;
    height: 100%;
  }

  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: 16px;
    background: var(--color-bg, #ffffff);
  }

  .loading p,
  .error p {
    margin: 0;
    font-size: 14px;
    color: var(--color-text, #333);
  }

  .error p {
    color: var(--color-error, #d32f2f);
  }

  .error a {
    padding: 8px 16px;
    background: var(--color-primary, #007acc);
    color: white;
    text-decoration: none;
    border-radius: 3px;
    font-size: 13px;
  }

  .error a:hover {
    background: var(--color-primary-hover, #005a9e);
  }
</style>
