<template>
  <div ref="mapEl" class="map"></div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import {
  createMap,
  loadCanals,
  // addPolyline,
  // showUserLocation,
  addCanals,
  addDock,
} from '../scripts/leafletMap'

const mapEl = ref(null)

onMounted(async () => {
  if (!mapEl.value) return

  const map = createMap(mapEl.value)

  // addPolyline(map)
  // showUserLocation(map)
  const canals = await loadCanals()
  await addCanals(map, canals)
  addDock(map, 52.375226, 4.883823, "Anne Frank (AF)")
  addDock(map, 52.360915, 4.885641, "Rijksmuseum (Rijks)")
  addDock(map, 52.377867, 4.897888, "Centraal Station (CS)")
  addDock(map, 52.376064, 4.905688, "Sea Palace (SP)")
  addDock(map, 52.382618, 4.859093, "Staverno (Staverno)")
  addDock(map, 52.335300, 4.917648, "E-Harbour (E-H)")
})
</script>

<style scoped>

</style>
