import type { PromptTemplate } from '../types'

const narrativeInlineImages: PromptTemplate = {
  id: 'narrative-inline-images',
  name: 'Narrative Inline Images',
  category: 'story',
  description: 'Instructions for narrative <pic> image tags',
  content: `<InlineImages>
You may embed images after impactful prose using this exact format:
<pic prompt="[detailed English visual description]" characters="[character names]"></pic>

The prompt must be a complete English visual description of the subject, action, setting, mood, lighting, and style. Never use character names as the visual description. Place tags after the prose they illustrate, never inside a sentence. Use 1-3 tags only for dramatic reveals, action climaxes, emotional peaks, important character moments, or new locations. Return no tag when there is no striking visual moment.
</InlineImages>`,
}

const narrativeVisualProse: PromptTemplate = {
  id: 'narrative-visual-prose',
  name: 'Narrative Visual Prose',
  category: 'story',
  description: 'Instructions for HTML/CSS visual prose output',
  content: `<VisualProse>
Your entire response must be valid structured HTML. Wrap every prose paragraph in <p> tags. Use <span> for inline styling and <div> with <style> blocks for complex visual elements.

Do not output plain text outside HTML tags, Markdown syntax, <script> tags, position: fixed/absolute, or animated box shadows. Use readable, atmospheric HTML/CSS that supports the narrative and matches the genre.
</VisualProse>`,
}

export const mediaTemplates: PromptTemplate[] = [narrativeInlineImages, narrativeVisualProse]
