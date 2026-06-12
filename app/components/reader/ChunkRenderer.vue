<script setup lang="ts">
import DOMPurify from 'dompurify'
import type { LoadedChunk } from '~/composables/useChunks'

const props = defineProps<{ chunk: LoadedChunk }>()

// Re-sanitize at render time: chunks are sanitized at upload, but the DB is
// writable via the REST API with the user's own JWT — render-time DOMPurify
// makes anything injected there inert.
const safeHtml = computed(() =>
  DOMPurify.sanitize(props.chunk.content, {
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'em', 'strong', 'i', 'b', 'ul', 'ol', 'li', 'br', 'hr', 'sup', 'sub', 'span'],
    ALLOWED_ATTR: [],
  }),
)
</script>

<template>
  <div :data-chunk-index="chunk.index" class="reader-chunk" v-html="safeHtml" />
</template>
