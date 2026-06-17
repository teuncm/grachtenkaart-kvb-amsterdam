<template>
  <div class="map-shell">
    <div
      class="search-control pointer-events-none absolute z-[1100] max-w-[24rem]"
      :class="isSearchOpen ? 'w-[calc(100vw-1.5rem)] sm:w-[24rem]' : 'w-auto'"
    >
      <div class="pointer-events-auto rounded-2xl border border-white/20 bg-slate-950/50 p-1 text-slate-50 shadow-[0_18px_50px_rgba(0,0,0,0.30)] backdrop-blur-md sm:p-2">
        <div v-if="!isSearchOpen" class="flex gap-2">
          <button
            type="button"
            class="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-[14px] font-semibold text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20"
            :aria-expanded="isSearchOpen"
            aria-controls="canal-search-panel"
            @click="toggleSearch"
          >
            <span>Search</span>
            <span v-if="searchQuery" class="max-w-32 truncate text-slate-200/70">{{ searchQuery }}</span>
          </button>
          <button type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20" :class="{ 'random-button-flash': isRandomButtonFlashing }" aria-label="Random canal" title="Random canal" @click="selectRandomCanal">
            <Dices class="h-6 w-6" :class="{ 'random-icon-spin': isRandomButtonFlashing }" aria-hidden="true" />
          </button>
        </div>

        <div id="canal-search-panel" :class="isSearchOpen ? 'block' : 'hidden'">
          <div class="mb-2 flex items-center justify-between gap-3">
            <label class="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-slate-200/70 sm:text-[0.72rem]" for="canal-search-input">Search canals</label>
            <button type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-medium text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20" @click="collapseSearch">Hide</button>
          </div>
          <div class="flex gap-2">
            <input
              id="canal-search-input"
              ref="searchInput"
              v-model="searchQuery"
              class="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[14px] text-inherit outline-none placeholder:text-slate-200/40 focus:border-sky-400/70 focus:ring-4 focus:ring-sky-400/20 sm:px-3.5 sm:py-3"
              type="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="Search by canal name or way id"
              @keydown.enter.prevent="selectFirstResult"
            />
            <button v-if="searchQuery" type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-[14px] font-medium text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20 sm:px-3.5 sm:py-3" @click="clearSearch">Clear</button>
            <button type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20 sm:px-3.5 sm:py-3" :class="{ 'random-button-flash': isRandomButtonFlashing }" aria-label="Random canal" title="Random canal" @click="selectRandomCanal">
              <Dices class="h-6 w-6" :class="{ 'random-icon-spin': isRandomButtonFlashing }" aria-hidden="true" />
            </button>
          </div>

          <div class="mt-3 grid max-h-[38vh] gap-2 overflow-auto sm:max-h-[340px]">
            <button
              v-for="result in searchResults"
              :key="result.groupKey"
              type="button"
              class="grid gap-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-inherit transition hover:border-sky-400/55 hover:bg-sky-400/10 focus:outline-none focus:ring-4 focus:ring-sky-400/20"
              @click="focusResult(result)"
            >
              <span class="text-[0.9rem] font-semibold leading-tight">{{ result.name || 'Unnamed canal' }}</span>
              <span class="text-[0.72rem] text-slate-200/65">{{ formatResultMeta(result) }}</span>
            </button>

            <p v-if="searchQuery && !searchResults.length" class="m-0 rounded-2xl border border-dashed border-white/10 px-3 py-2 text-[0.84rem] text-slate-200/65">No canals match this query.</p>
          </div>
        </div>
      </div>
    </div>

    <div ref="mapEl" class="map"></div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Dices } from '@lucide/vue'
import {
  createMap,
  loadCanals,
  addCanals,
  addDock,
  buildCanalSearchIndex,
  findCanalResultByFeature,
  listCanals,
  searchCanals,
  focusCanalResult,
  clearCanalResultHighlight,
} from '../scripts/leafletMap'

const mapEl = ref(null)
const searchInput = ref(null)
const searchQuery = ref('')
const isSearchOpen = ref(false)
const canalsLayer = ref(null)
const canalSearchIndex = ref(null)
const selectedResult = ref(null)
const isRandomButtonFlashing = ref(false)
let map = null
let randomButtonFlashTimeout = null

const searchResults = computed(() => {
  const query = searchQuery.value.trim()

  if (!canalSearchIndex.value) {
    return []
  }

  if (!query) {
    return listCanals(canalSearchIndex.value)
  }

  return searchCanals(canalSearchIndex.value, query)
})

function clearSearch() {
  clearSelectedResult()
  searchQuery.value = ''
}

async function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value

  if (isSearchOpen.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}

function collapseSearch() {
  isSearchOpen.value = false
}

function focusResult(result) {
  if (!map || !canalsLayer.value) return

  clearSelectedResult()

  const focused = focusCanalResult(map, canalsLayer.value, result)

  if (focused) {
    selectedResult.value = result
  }

  if (focused && result.name) {
    searchQuery.value = result.name
  }
}

function selectFirstResult() {
  if (searchResults.value.length === 0) return

  focusResult(searchResults.value[0])
}

function selectRandomCanal() {
  if (!canalSearchIndex.value) return

  const namedCanals = listCanals(canalSearchIndex.value)

  if (namedCanals.length === 0) return

  flashRandomButton()

  const randomCanal = namedCanals[Math.floor(Math.random() * namedCanals.length)]
  focusResult(randomCanal)
}

function flashRandomButton() {
  if (randomButtonFlashTimeout !== null) {
    clearTimeout(randomButtonFlashTimeout)
  }

  isRandomButtonFlashing.value = false

  requestAnimationFrame(() => {
    isRandomButtonFlashing.value = true
    randomButtonFlashTimeout = setTimeout(() => {
      isRandomButtonFlashing.value = false
      randomButtonFlashTimeout = null
    }, 420)
  })
}

function formatResultMeta(result) {
  if (!result?.wayIds?.length) {
    return ''
  }

  if (result.wayIds.length === 1) {
    return result.wayIds[0]
  }

  return `${result.wayIds[0]} +${result.wayIds.length - 1} more`
}

function clearSelectedResult() {
  if (!canalsLayer.value || !selectedResult.value) {
    selectedResult.value = null
    return
  }

  clearCanalResultHighlight(canalsLayer.value, selectedResult.value)
  selectedResult.value = null
}

function bindCanalClickSelection() {
  if (!canalsLayer.value || !canalSearchIndex.value) return

  canalsLayer.value.eachLayer((featureLayer) => {
    featureLayer.on('click', () => {
      const result = findCanalResultByFeature(canalSearchIndex.value, featureLayer.feature)

      if (!result) return

      focusResult(result)
    })
  })
}

watch(searchQuery, (nextValue, previousValue) => {
  if (previousValue && !nextValue) {
    clearSelectedResult()
  }
})

onMounted(async () => {
  if (!mapEl.value) return

  map = createMap(mapEl.value)

  const canals = await loadCanals()
  canalSearchIndex.value = buildCanalSearchIndex(canals)
  canalsLayer.value = await addCanals(map, canals)
  bindCanalClickSelection()
  addDock(map, 52.375226, 4.883823, "Anne Frank (AF)")
  addDock(map, 52.360915, 4.885641, "Rijksmuseum (Rijks)")
  addDock(map, 52.377867, 4.897888, "Centraal Station (CS)")
  addDock(map, 52.3692092, 4.8998606, "Zwanenburgwal (ZWA)")
  addDock(map, 52.376064, 4.905688, "Sea Palace (SP)")
  addDock(map, 52.3829488, 4.8594078, "Staverno")
  addDock(map, 52.335300, 4.917648, "E-Harbour (E-H)")
  addDock(map, 52.3415982, 4.8864876, "Strandzuid")
  addDock(map, 52.3433485, 4.8525659, "Olympisch Stadion")
})

onUnmounted(() => {
  if (randomButtonFlashTimeout !== null) {
    clearTimeout(randomButtonFlashTimeout)
  }
})
</script>

<style scoped>
.map-shell {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
}

.map {
  height: 100%;
  width: 100%;
}

.search-control {
  right: calc(0.75rem + env(safe-area-inset-right));
  top: calc(0.75rem + env(safe-area-inset-top));
}

:deep(.leaflet-top) {
  top: env(safe-area-inset-top);
}

:deep(.leaflet-bottom) {
  bottom: env(safe-area-inset-bottom);
}

:deep(.leaflet-left) {
  left: env(safe-area-inset-left);
}

:deep(.leaflet-right) {
  right: env(safe-area-inset-right);
}

.search-control button {
  cursor: pointer;
}

.random-button-flash {
  animation: random-button-flash 420ms ease-out;
}

.random-icon-spin {
  animation: random-icon-spin 420ms ease-in-out;
  transform-origin: center;
}

@keyframes random-button-flash {
  0% {
    background: rgb(255 255 255 / 0.36);
    box-shadow:
      0 0 0 0 rgb(255 255 255 / 0.60),
      0 0 18px rgb(255 255 255 / 0.68);
  }

  45% {
    background: rgb(255 255 255 / 0.44);
    box-shadow:
      0 0 0 6px rgb(255 255 255 / 0),
      0 0 26px rgb(255 255 255 / 0.58);
  }

  100% {
    background: rgb(255 255 255 / 0.10);
    box-shadow:
      0 0 0 0 rgb(255 255 255 / 0),
      0 0 0 rgb(255 255 255 / 0);
  }
}

@keyframes random-icon-spin {
  0% {
    transform: rotate(0deg);
  }

  50% {
    transform: rotate(20deg);
  }

  100% {
    transform: rotate(0deg);
  }
}

@media (min-width: 640px) {
  .search-control {
    right: calc(1rem + env(safe-area-inset-right));
    top: calc(1rem + env(safe-area-inset-top));
  }
}

:deep(.combined-scale-control) {
  color: rgb(15 23 42);
  display: grid;
  grid-template-areas:
    "label label"
    "vertical ."
    "corner horizontal";
  grid-template-columns: auto auto;
  grid-template-rows: auto auto auto;
  justify-items: start;
  margin-left: 10px;
  margin-bottom: 10px;
  pointer-events: none;
}

:deep(.combined-scale-control__label) {
  grid-area: label;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 2px;
  text-shadow:
    0 1px 0 rgb(255 255 255 / 0.75),
    1px 0 0 rgb(255 255 255 / 0.75),
    0 -1px 0 rgb(255 255 255 / 0.75),
    -1px 0 0 rgb(255 255 255 / 0.75);
}

:deep(.combined-scale-control__horizontal) {
  align-self: end;
  border-bottom: 2px solid rgb(15 23 42 / 0.75);
  border-right: 2px solid rgb(15 23 42 / 0.75);
  grid-area: horizontal;
  height: 7px;
}

:deep(.combined-scale-control__vertical) {
  align-self: end;
  border-left: 2px solid rgb(15 23 42 / 0.75);
  border-top: 2px solid rgb(15 23 42 / 0.75);
  grid-area: vertical;
  justify-self: start;
  width: 7px;
}

:deep(.combined-scale-control__corner) {
  border-bottom: 2px solid rgb(15 23 42 / 0.75);
  border-left: 2px solid rgb(15 23 42 / 0.75);
  grid-area: corner;
  height: 7px;
  width: 7px;
}
</style>
