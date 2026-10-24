<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEngineStore } from '@/stores/engine'
import { ALIGN_LABELS, type AlignEdge, type DistributeAxis } from '@/canvas/align'
import type { GuideOrientation } from '@/canvas/guides'
import UiIcon from './UiIcon.vue'

const store = useEngineStore()

const relative = ref<'selection' | 'document'>('selection')
const matchWidth = ref(false)
const matchHeight = ref(false)
const snapOpen = ref(false)
const guidesOpen = ref(false)

const alignButtons: { edge: AlignEdge; icon: 'align-left' | 'align-center-h' | 'align-right' | 'align-top' | 'align-center-v' | 'align-bottom' }[] = [
  { edge: 'left', icon: 'align-left' },
  { edge: 'center-h', icon: 'align-center-h' },
  { edge: 'right', icon: 'align-right' },
  { edge: 'top', icon: 'align-top' },
  { edge: 'center-v', icon: 'align-center-v' },
  { edge: 'bottom', icon: 'align-bottom' },
]

const hasSelection = computed(() => store.selectionObjects.length > 0)
const canAlign = computed(() => hasSelection.value && store.selectionObjects.length >= 2)
const canDistribute = computed(() => store.selectionObjects.length >= 3)
const snapped = computed(() => store.snapSettings.enabled && !store.snapTemporarilyOff)

const align = (edge: AlignEdge): void => {
  if (!canAlign.value) {
    return
  }
  store.alignSelection(edge, relative.value, { matchWidth: matchWidth.value, matchHeight: matchHeight.value })
}

const distribute = (axis: DistributeAxis): void => {
  if (!canDistribute.value) {
    return
  }
  store.distributeSelection(axis)
}

const toggleSnapSource = (key: 'grid' | 'guides' | 'edges' | 'centers' | 'points'): void => {
  const next = { ...store.snapSettings, [key]: !store.snapSettings[key] }
  store.setSnapSettings(next)
}

const setSpacing = (delta: number): void => {
  store.setGridSpacing(store.gridSpacing + delta)
}

const guideLabel = (guide: { orientation: GuideOrientation; position: number }): string =>
  `${guide.orientation === 'v' ? 'Vertical' : 'Horizontal'} ${Math.round(guide.position * 100) / 100}`
</script>

<template>
  <div class="canvas-controls" role="toolbar" aria-label="Canvas tools">
    <button
      type="button"
      :class="{ active: store.handTool }"
      :aria-pressed="store.handTool"
      title="Ręczne przesunięcie (lub przytrzymaj spację)"
      @click="store.toggleHandTool()"
    >
      <UiIcon name="hand" :size="15" />
    </button>

    <span class="control-divider" />

    <button type="button" :class="{ active: store.gridVisible }" :aria-pressed="store.gridVisible" title="Pokaż/Ukryj siatkę" @click="store.toggleGrid()">
      <UiIcon name="grid" :size="15" />
    </button>
    <button type="button" title="Zmniejsz odstęp siatki" @click="setSpacing(-2)">
      <UiIcon name="minus" :size="13" />
    </button>
    <span class="spacing-value">{{ store.gridSpacing }}</span>
    <button type="button" title="Zwiększ odstęp siatki" @click="setSpacing(2)">
      <UiIcon name="plus" :size="13" />
    </button>

    <button type="button" :class="{ active: store.rulersVisible }" :aria-pressed="store.rulersVisible" title="Pokaż/Ukryj linijki" @click="store.toggleRulers()">
      <UiIcon name="ruler" :size="15" />
    </button>

    <span class="popover-anchor">
      <button type="button" :class="{ active: snapped }" :aria-pressed="snapped" title="Przyciąganie" @click="store.toggleSnap(); snapOpen = !snapOpen">
        <UiIcon name="snap" :size="15" />
      </button>
      <div v-if="snapOpen" class="canvas-popover" @keydown.escape="snapOpen = false">
      <label class="popover-row">
        <input type="checkbox" :checked="store.snapSettings.grid" @change="toggleSnapSource('grid')" />
        <span>Siatka</span>
      </label>
      <label class="popover-row">
        <input type="checkbox" :checked="store.snapSettings.guides" @change="toggleSnapSource('guides')" />
        <span>Prowadnice</span>
      </label>
      <label class="popover-row">
        <input type="checkbox" :checked="store.snapSettings.edges" @change="toggleSnapSource('edges')" />
        <span>Krawędzie</span>
      </label>
      <label class="popover-row">
        <input type="checkbox" :checked="store.snapSettings.centers" @change="toggleSnapSource('centers')" />
        <span>Środki</span>
      </label>
      <label class="popover-row">
        <input type="checkbox" :checked="store.snapSettings.points" @change="toggleSnapSource('points')" />
        <span>Punkty</span>
      </label>
      <label class="popover-row">
        <span>Tolerancja (px)</span>
        <input type="number" min="1" max="40" :value="store.snapSettings.tolerance" @change="store.setSnapTolerance(Number(($event.target as HTMLInputElement).value))" />
      </label>
      </div>
    </span>

    <span class="control-divider" />

    <button type="button" :class="{ active: store.marqueeMode === 'inside' }" title="Zaznaczanie – obiekty wewnątrz prostokąta" @click="store.setMarqueeMode('inside')">
      Zawartość
    </button>
    <button type="button" :class="{ active: store.marqueeMode === 'intersect' }" title="Zaznaczanie – odciecia prostokąta" @click="store.setMarqueeMode('intersect')">
      Przecięcia
    </button>

    <span class="control-divider" />

    <div class="button-group" role="group" aria-label="Wyrównanie">
      <button
        v-for="button in alignButtons"
        :key="button.edge"
        type="button"
        :disabled="!canAlign"
        :title="ALIGN_LABELS[button.edge]"
        @click="align(button.edge)"
      >
        <UiIcon :name="button.icon" :size="15" />
      </button>
    </div>

    <div class="button-group" role="group" aria-label="Rozmieszczanie">
      <button type="button" :disabled="!canDistribute" title="Równomiernie w poziomie" @click="distribute('x')">
        <UiIcon name="distribute-h" :size="15" />
      </button>
      <button type="button" :disabled="!canDistribute" title="Równomiernie w pionie" @click="distribute('y')">
        <UiIcon name="distribute-v" :size="15" />
      </button>
    </div>

    <div class="button-group" role="group" aria-label="Dopasowanie rozmiaru">
      <button type="button" :class="{ active: matchWidth }" :disabled="!canAlign" title="Dopasuj szerokość" @click="matchWidth = !matchWidth">
        <UiIcon name="match-width" :size="15" />
      </button>
      <button type="button" :class="{ active: matchHeight }" :disabled="!canAlign" title="Dopasuj wysokość" @click="matchHeight = !matchHeight">
        <UiIcon name="match-height" :size="15" />
      </button>
    </div>

    <label class="relative-select">
      <span>Względem</span>
      <select v-model="relative">
        <option value="selection">Zaznaczenia</option>
        <option value="document">Dokumentu</option>
      </select>
    </label>

    <span class="control-divider" />

    <span class="popover-anchor">
      <button type="button" :class="{ active: guidesOpen }" :aria-pressed="guidesOpen" title="Prowadnice" @click="guidesOpen = !guidesOpen">
        <UiIcon name="ruler" :size="15" />
        <span v-if="store.guides.length" class="badge-count">{{ store.guides.length }}</span>
      </button>
      <div v-if="guidesOpen" class="canvas-popover canvas-popover-wide" @keydown.escape="guidesOpen = false">
      <div v-if="store.guides.length === 0" class="popover-empty">Brak prowadnic. Przeciągnij z linijki.</div>
      <div v-for="guide in store.guides" :key="guide.id" class="popover-row guide-row">
        <span>{{ guideLabel(guide) }}</span>
        <button type="button" title="Usuń prowadnicę" @click="store.removeGuide(guide.id)">
          <UiIcon name="trash" :size="14" />
        </button>
      </div>
        <button v-if="store.guides.length" type="button" class="popover-action" @click="store.clearGuides()">
          Usuń wszystkie
        </button>
      </div>
    </span>

    <span class="control-divider" />

    <button type="button" :title="store.fullscreen ? 'Zakończ pełnoekranowy' : 'Pełnoekranowy'" @click="store.fullscreen ? store.exitFullscreen() : store.toggleFullscreen()">
      <UiIcon :name="store.fullscreen ? 'compress' : 'expand'" :size="15" />
    </button>
  </div>
</template>
