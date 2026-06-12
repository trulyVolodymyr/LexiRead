<script setup lang="ts">
import { TARGET_LANGUAGES } from '~/utils/languages'

const visible = defineModel<boolean>({ default: false })

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const FONTS = [
  { label: 'Georgia (serif)', value: 'Georgia, serif' },
  { label: 'Literata (serif)', value: "'Literata', Georgia, serif" },
  { label: 'System sans', value: 'system-ui, sans-serif' },
  { label: 'Helvetica / Arial', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
]
</script>

<template>
  <el-drawer v-model="visible" title="Reading settings" direction="rtl" size="320px">
    <el-form label-position="top">
      <el-form-item label="Reading mode">
        <el-radio-group v-model="settings.pageMode">
          <el-radio-button value="scroll">Scroll</el-radio-button>
          <el-radio-button value="paginated">Chapters</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="Theme">
        <el-radio-group v-model="settings.theme">
          <el-radio-button value="light">Light</el-radio-button>
          <el-radio-button value="sepia">Sepia</el-radio-button>
          <el-radio-button value="dark">Dark</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="Font">
        <el-select v-model="settings.fontFamily" class="w-full">
          <el-option v-for="font in FONTS" :key="font.value" :label="font.label" :value="font.value" />
        </el-select>
      </el-form-item>

      <el-form-item :label="`Text size — ${settings.fontSize}px`">
        <el-slider v-model="settings.fontSize" :min="14" :max="28" :step="1" />
      </el-form-item>

      <el-form-item :label="`Line spacing — ${settings.lineHeight.toFixed(1)}`">
        <el-slider v-model="settings.lineHeight" :min="1.2" :max="2.4" :step="0.1" />
      </el-form-item>

      <el-form-item :label="`Margins — ${settings.marginsPct}%`">
        <el-slider v-model="settings.marginsPct" :min="0" :max="20" :step="1" />
      </el-form-item>

      <el-form-item label="Translate to">
        <el-select v-model="settings.targetLang" filterable class="w-full">
          <el-option v-for="lang in TARGET_LANGUAGES" :key="lang.code" :label="lang.name" :value="lang.code" />
        </el-select>
      </el-form-item>
    </el-form>
  </el-drawer>
</template>
