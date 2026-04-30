import { create } from 'zustand'
import type { Analyst, Cluster } from './types'

export interface FiltersState {
  nameSearch: string
  clusterIds: number[]
  personas: string[]
  activities: string[]
  office: string | null
}

interface AppState {
  analysts: Analyst[]
  clusters: Cluster[]
  selectedAnalystId: number | null
  selectedClusterId: number | null
  filters: FiltersState
  viewMode: '3d' | '2d'
  isLoading: boolean
  error: string | null
  setData: (analysts: Analyst[], clusters: Cluster[]) => void
  setLoading: (value: boolean) => void
  setError: (value: string | null) => void
  setSelectedAnalystId: (value: number | null) => void
  setSelectedClusterId: (value: number | null) => void
  updateFilters: (value: Partial<FiltersState>) => void
  toggleCluster: (clusterId: number) => void
  togglePersona: (persona: string) => void
  toggleActivity: (activity: string) => void
  setViewMode: (value: '3d' | '2d') => void
  resetFilters: () => void
}

const initialFilters: FiltersState = {
  nameSearch: '',
  clusterIds: [],
  personas: [],
  activities: [],
  office: null,
}

export const useAppStore = create<AppState>((set) => ({
  analysts: [],
  clusters: [],
  selectedAnalystId: null,
  selectedClusterId: null,
  filters: initialFilters,
  viewMode: '3d',
  isLoading: true,
  error: null,
  setData: (analysts, clusters) => set({ analysts, clusters }),
  setLoading: (value) => set({ isLoading: value }),
  setError: (value) => set({ error: value }),
  setSelectedAnalystId: (value) => set({ selectedAnalystId: value }),
  setSelectedClusterId: (value) => set({ selectedClusterId: value }),
  updateFilters: (value) => set((state) => ({ filters: { ...state.filters, ...value } })),
  toggleCluster: (clusterId) =>
    set((state) => ({
      filters: {
        ...state.filters,
        clusterIds: state.filters.clusterIds.includes(clusterId)
          ? state.filters.clusterIds.filter((id) => id !== clusterId)
          : [...state.filters.clusterIds, clusterId],
      },
    })),
  togglePersona: (persona) =>
    set((state) => ({
      filters: {
        ...state.filters,
        personas: state.filters.personas.includes(persona)
          ? state.filters.personas.filter((item) => item !== persona)
          : [...state.filters.personas, persona],
      },
    })),
  toggleActivity: (activity) =>
    set((state) => ({
      filters: {
        ...state.filters,
        activities: state.filters.activities.includes(activity)
          ? state.filters.activities.filter((item) => item !== activity)
          : [...state.filters.activities, activity],
      },
    })),
  setViewMode: (value) => set({ viewMode: value }),
  resetFilters: () => set({ filters: initialFilters }),
}))
