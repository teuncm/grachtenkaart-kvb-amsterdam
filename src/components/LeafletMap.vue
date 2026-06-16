<template>
  <div class="map-shell">
    <div
      class="search-control pointer-events-none absolute z-[1100] max-w-[24rem]"
      :class="isSearchOpen ? 'w-[calc(100vw-1.5rem)] sm:w-[24rem]' : 'w-auto'"
    >
      <div class="pointer-events-auto rounded-2xl border border-white/15 bg-slate-950/90 p-2 text-slate-50 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-md sm:p-4">
        <button
          v-if="!isSearchOpen"
          type="button"
          class="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-[15px] font-semibold text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20"
          :aria-expanded="isSearchOpen"
          aria-controls="canal-search-panel"
          @click="toggleSearch"
        >
          <span>Search</span>
          <span v-if="searchQuery" class="max-w-32 truncate text-slate-200/70">{{ searchQuery }}</span>
        </button>

        <div id="canal-search-panel" :class="isSearchOpen ? 'block' : 'hidden'">
          <div class="mb-2 flex items-center justify-between gap-3">
            <label class="block text-[0.72rem] font-bold uppercase tracking-[0.12em] text-slate-200/70 sm:text-[0.78rem]" for="canal-search-input">Search canals</label>
            <button type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[14px] font-medium text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20" @click="collapseSearch">Hide</button>
          </div>
          <div class="flex gap-2">
            <input
              id="canal-search-input"
              ref="searchInput"
              v-model="searchQuery"
              class="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[15px] text-inherit outline-none placeholder:text-slate-200/40 focus:border-sky-400/70 focus:ring-4 focus:ring-sky-400/20 sm:px-3.5 sm:py-3"
              type="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="Search by canal name or way id"
              @keydown.enter.prevent="selectFirstResult"
            />
            <button type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-[15px] font-medium text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20 sm:px-3.5 sm:py-3" @click="selectRandomCanal">Random</button>
            <button v-if="searchQuery" type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-[15px] font-medium text-inherit transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-sky-400/20 sm:px-3.5 sm:py-3" @click="clearSearch">Clear</button>
          </div>

          <div class="mt-3 grid max-h-[38vh] gap-2 overflow-auto sm:max-h-[340px]">
            <button
              v-for="result in searchResults"
              :key="result.groupKey"
              type="button"
              class="grid gap-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-inherit transition hover:border-sky-400/55 hover:bg-sky-400/10 focus:outline-none focus:ring-4 focus:ring-sky-400/20"
              @click="focusResult(result)"
            >
              <span class="text-[0.98rem] font-semibold leading-tight">{{ result.name || 'Unnamed canal' }}</span>
              <span class="text-[0.78rem] text-slate-200/65">{{ formatResultMeta(result) }}</span>
            </button>

            <p v-if="searchQuery && !searchResults.length" class="m-0 rounded-2xl border border-dashed border-white/10 px-3 py-2 text-[0.9rem] text-slate-200/65">No canals match this query.</p>
          </div>
        </div>
      </div>
    </div>

    <div ref="mapEl" class="map"></div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
let map = null

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

  const randomCanal = namedCanals[Math.floor(Math.random() * namedCanals.length)]
  focusResult(randomCanal)
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
  addDock(map, 52.376064, 4.905688, "Sea Palace (SP)")
  addDock(map, 52.382618, 4.859093, "Staverno (Staverno)")
  addDock(map, 52.335300, 4.917648, "E-Harbour (E-H)")
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

@media (min-width: 640px) {
  .search-control {
    right: calc(1rem + env(safe-area-inset-right));
    top: calc(1rem + env(safe-area-inset-top));
  }
}

:deep(.leaflet-control-scale-line) {
  border-color: rgb(15 23 42 / 0.75);
  color: rgb(15 23 42);
  font-weight: 700;
}

:deep(.vertical-scale-control) {
  align-items: flex-end;
  display: flex;
  height: 104px;
  margin-left: 10px;
  pointer-events: none;
}

:deep(.vertical-scale-control__line) {
  border-bottom: 2px solid rgb(15 23 42 / 0.75);
  border-left: 2px solid rgb(15 23 42 / 0.75);
  border-top: 2px solid rgb(15 23 42 / 0.75);
  width: 9px;
}
</style>
