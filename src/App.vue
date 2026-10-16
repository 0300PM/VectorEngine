<script setup lang="ts">
import AppHeader from './ui/components/AppHeader.vue'
import AssetStudioPanel from './ui/components/assets/AssetStudioPanel.vue'
import BatchPanel from './ui/components/batch/BatchPanel.vue'
import DocumentSourcePanel from './ui/components/editor/DocumentSourcePanel.vue'
import IssuesPanel from './ui/components/editor/IssuesPanel.vue'
import LayersPanel from './ui/components/editor/LayersPanel.vue'
import FilesPanel from './ui/components/files/FilesPanel.vue'
import RasterExportPanel from './ui/components/files/RasterExportPanel.vue'
import PreviewPanel from './ui/components/preview/PreviewPanel.vue'
import ExportSetPanel from './ui/components/sets/ExportSetPanel.vue'
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8">
    <AppHeader />
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div class="flex flex-col gap-6">
        <DocumentSourcePanel />
        <IssuesPanel />
        <LayersPanel />
      </div>
      <div class="flex flex-col gap-6">
        <PreviewPanel />
        <RasterExportPanel />
        <FilesPanel />
      </div>
    </div>
    <ExportSetPanel />
    <div class="grid gap-6 lg:grid-cols-2">
      <BatchPanel />
      <AssetStudioPanel />
    </div>
  </main>
</template>
