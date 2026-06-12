<script setup lang="ts">
import { TARGET_LANGUAGES } from '~/utils/languages'

const { stage, error, progress, meta, coverPreviewUrl, existingBookId, parse, upload, reset } =
  useBookUpload()
const router = useRouter()

const dragOver = ref(false)
const fileInput = ref<HTMLInputElement>()

function onDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) parse(file)
}

function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) parse(file)
}

async function confirmUpload() {
  const bookId = await upload()
  if (bookId) {
    ElMessage.success('Book added to your library')
    router.push(`/read/${bookId}`)
  }
}

watch(error, (message) => {
  if (message) ElMessage.error(message)
})

watch(existingBookId, (id) => {
  if (id) {
    ElMessage.info('This book is already in your library — opening it.')
    router.push(`/read/${id}`)
  }
})
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto max-w-2xl px-4 py-8">
      <h1 class="mb-6 text-2xl font-bold">Add a book</h1>

      <!-- dropzone -->
      <div
        v-if="stage === 'idle' || stage === 'parsing'"
        class="flex h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors"
        :class="
          dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-gray-300 dark:border-gray-700'
        "
        @click="fileInput?.click()"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <template v-if="stage === 'parsing'">
          <span class="text-gray-500">Reading the file…</span>
        </template>
        <template v-else>
          <div class="text-4xl">📚</div>
          <p class="font-medium">Drop a book here or click to choose</p>
          <p class="text-sm text-gray-500">EPUB · FB2 · TXT — any language</p>
        </template>
        <input ref="fileInput" type="file" accept=".epub,.fb2,.txt,.zip" class="hidden" @change="onPick" />
      </div>

      <!-- confirmation card -->
      <el-card v-else-if="stage === 'confirm' || stage === 'uploading'">
        <div class="flex gap-5">
          <img
            v-if="coverPreviewUrl"
            :src="coverPreviewUrl"
            alt="Book cover"
            class="h-40 w-28 rounded object-cover shadow"
          />
          <div
            v-else
            class="flex h-40 w-28 items-center justify-center rounded bg-gray-100 text-3xl dark:bg-gray-800"
          >
            📖
          </div>

          <el-form label-position="top" class="flex-1" :disabled="stage === 'uploading'">
            <el-form-item label="Title">
              <el-input v-model="meta.title" />
            </el-form-item>
            <el-form-item label="Author">
              <el-input v-model="meta.author" placeholder="Unknown" />
            </el-form-item>
            <el-form-item label="Book language">
              <el-select v-model="meta.language" filterable class="w-full">
                <el-option
                  v-for="lang in TARGET_LANGUAGES"
                  :key="lang.code"
                  :label="lang.name"
                  :value="lang.code"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </div>

        <el-progress v-if="stage === 'uploading'" :percentage="progress" class="mt-4" />

        <div class="mt-4 flex justify-end gap-2">
          <el-button :disabled="stage === 'uploading'" @click="reset">Cancel</el-button>
          <el-button type="primary" :loading="stage === 'uploading'" @click="confirmUpload">
            Add to library
          </el-button>
        </div>
      </el-card>
    </main>
  </div>
</template>
