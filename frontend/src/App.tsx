import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sphere, Stars } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import { useAppStore } from './store'
import type { Analyst, Cluster, NetworkMap } from './types'

const CLUSTER_COLORS = ['#4FC3F7', '#81C784', '#FFB74D', '#F06292', '#CE93D8', '#4DB6AC', '#FFF176', '#FF8A65', '#90CAF9', '#A5D6A7']
const ACCESS_PASSWORDS = ['rosslyn']
const ACCESS_STORAGE_KEY = 'rosslyn-network-access'

interface ViewportProfile {
  width: number
  height: number
  isMobile: boolean
  isCompactMobile: boolean
  topInset: string
  bottomInset: string
  mobileOverlayMaxHeight: string
  mobileDrawerMaxHeight: string
  popupMaxHeight: string
  popupBodyMaxHeight: string
  listMinWidth: number
  galaxyFov: number
  galaxyFogFar: number
}

function createViewportProfile(width: number, height: number): ViewportProfile {
  const safeWidth = Math.max(width || 390, 320)
  const safeHeight = Math.max(height || 844, 568)
  const isMobile = safeWidth < 1024
  const isCompactMobile = safeWidth < 420 || safeHeight < 760
  return {
    width: safeWidth,
    height: safeHeight,
    isMobile,
    isCompactMobile,
    topInset: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
    bottomInset: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
    mobileOverlayMaxHeight: `min(${Math.round(safeHeight * 0.64)}px, calc(100dvh - env(safe-area-inset-top, 0px) - 5rem))`,
    mobileDrawerMaxHeight: `min(${Math.round(safeHeight * 0.78)}px, calc(100dvh - env(safe-area-inset-top, 0px) - 2rem))`,
    popupMaxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)',
    popupBodyMaxHeight: `min(${Math.round(safeHeight * 0.7)}px, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 9rem))`,
    listMinWidth: Math.max(980, Math.round(safeWidth * 1.95)),
    galaxyFov: isMobile ? (safeWidth < 380 ? 70 : safeWidth < 460 ? 66 : 62) : 55,
    galaxyFogFar: isMobile ? 260 : 220,
  }
}

function normalizeInstagramHandle(handle: string | null | undefined): string | null {
  if (!handle) return null
  let normalized = handle.trim()
  normalized = normalized.replace(/^[`'"\s]+/, '')
  normalized = normalized.replace(/\(.*?\)/g, '')
  normalized = normalized.replace(/instagram[:\s-]*/i, '')
  normalized = normalized.replace(/^@+/, '')
  normalized = normalized.replace(/[^a-zA-Z0-9._]/g, '')
  return normalized || null
}

function formatInstagramLabel(handle: string | null | undefined): string | null {
  const normalized = normalizeInstagramHandle(handle)
  return normalized ? `@${normalized}` : null
}

function App() {
  const {
    analysts,
    clusters,
    selectedAnalystId,
    selectedClusterId,
    filters,
    viewMode,
    isLoading,
    error,
    setData,
    setLoading,
    setError,
    setSelectedAnalystId,
    setSelectedClusterId,
    setViewMode,
    updateFilters,
    resetFilters,
    toggleCluster,
    toggleActivity,
  } = useAppStore()

  const [sortKey, setSortKey] = useState<'name' | 'cluster' | 'persona'>('name')
  const [cameraResetToken, setCameraResetToken] = useState(0)
  const [viewport, setViewport] = useState<ViewportProfile>(() =>
    typeof window !== 'undefined' ? createViewportProfile(window.innerWidth, window.innerHeight) : createViewportProfile(1440, 900),
  )
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [accessValue, setAccessValue] = useState('')
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem(ACCESS_STORAGE_KEY) === 'granted') {
      setIsUnlocked(true)
    }
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    let mounted = true
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/data/network-map.json')
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        const payload = (await response.json()) as NetworkMap
        if (mounted) {
          setData(payload.analysts, payload.clusters)
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    void loadData()
    return () => {
      mounted = false
    }
  }, [isUnlocked, setData, setError, setLoading])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setViewport(createViewportProfile(window.innerWidth, window.innerHeight))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  useEffect(() => {
    if (!viewport.isMobile) {
      setMobileFiltersOpen(false)
    }
  }, [viewport.isMobile])

  const analystMap = useMemo(() => new Map(analysts.map((analyst) => [analyst.id, analyst])), [analysts])
  const clusterMap = useMemo(() => new Map(clusters.map((cluster) => [cluster.id, cluster])), [clusters])
  const offices = useMemo(() => Array.from(new Set(analysts.map((analyst) => analyst.office))).sort(), [analysts])

  const filteredAnalysts = useMemo(() => {
    return analysts.filter((analyst) => {
      const nameMatch = !filters.nameSearch || analyst.name.toLowerCase().includes(filters.nameSearch.toLowerCase())
      const clusterMatch = filters.clusterIds.length === 0 || filters.clusterIds.includes(analyst.clusterId)
      const activityMatch =
        filters.activities.length === 0 ||
        filters.activities.every((activity) => analyst.topActivities.includes(activity) || analyst.activityScores[activity] > 0)
      const officeMatch = !filters.office || analyst.office === filters.office
      return nameMatch && clusterMatch && activityMatch && officeMatch
    })
  }, [analysts, filters])

  const filteredIds = useMemo(() => new Set(filteredAnalysts.map((analyst) => analyst.id)), [filteredAnalysts])
  const selectedAnalyst = selectedAnalystId !== null ? analystMap.get(selectedAnalystId) ?? null : null
  const selectedCluster = selectedClusterId !== null ? clusterMap.get(selectedClusterId) ?? null : null
  const searchFocusClusterId =
    filters.nameSearch.trim() && filteredAnalysts.length === 1 && !selectedAnalyst && selectedClusterId === null ? filteredAnalysts[0].clusterId : null

  const sortedTableRows = useMemo(() => {
    const rows = [...filteredAnalysts]
    rows.sort((a, b) => {
      if (sortKey === 'cluster') return a.podName.localeCompare(b.podName) || a.name.localeCompare(b.name)
      if (sortKey === 'persona') return a.personaTag.localeCompare(b.personaTag) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
    return rows
  }, [filteredAnalysts, sortKey])

  const resetOverview = () => {
    setSelectedClusterId(null)
    setSelectedAnalystId(null)
    setCameraResetToken((value) => value + 1)
    setMobileFiltersOpen(false)
  }

  const resetToDefault = () => {
    updateFilters({ nameSearch: '', clusterIds: [], activities: [], office: null })
    setViewMode('3d')
    resetOverview()
  }

  const handleSearchChange = (value: string) => {
    updateFilters({ nameSearch: value })
    if (viewport.isMobile && value.trim()) {
      setViewMode('2d')
      setSelectedClusterId(null)
      setSelectedAnalystId(null)
    }
  }

  const handleSelectCluster = (clusterId: number | null) => {
    setSelectedClusterId(clusterId)
    if (viewport.isMobile && clusterId !== null) {
      setMobileFiltersOpen(false)
    }
  }

  const handleSelectAnalyst = (analystId: number | null) => {
    setSelectedAnalystId(analystId)
    if (viewport.isMobile && analystId !== null) {
      setMobileFiltersOpen(false)
    }
  }

  const handleUnlock = () => {
    const normalized = accessValue.trim().toLowerCase()
    if (ACCESS_PASSWORDS.includes(normalized)) {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(ACCESS_STORAGE_KEY, 'granted')
      }
      setIsUnlocked(true)
      setAccessError('')
      setAccessValue('')
      return
    }
    setAccessError('Incorrect password')
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#020408] text-white">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#06111c]/95 p-8 shadow-2xl backdrop-blur">
            <p className="font-orbitron text-xl uppercase tracking-[0.35em] text-sky-200">Rosslyn Analyst Network</p>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Enter the shared access word to open the network map.
            </p>
            <div className="mt-6 space-y-3">
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                value={accessValue}
                onChange={(event) => setAccessValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleUnlock()
                }}
                placeholder="Password"
                type="password"
              />
              {accessError ? <p className="text-sm text-rose-300">{accessError}</p> : null}
              <button
                className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm uppercase tracking-[0.18em] text-slate-100 transition hover:border-sky-300 hover:text-white"
                onClick={handleUnlock}
              >
                Enter
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col lg:flex-row">
        {!viewport.isMobile && (
          <aside className="border-b border-white/10 bg-white/5 p-4 backdrop-blur lg:w-[320px] lg:border-b-0 lg:border-r">
            <SidebarHeader viewMode={viewMode} setViewMode={setViewMode} />
            <FilterControls
              analysts={analysts}
              clusters={clusters}
              filters={filters}
              offices={offices}
              updateFilters={updateFilters}
              toggleCluster={toggleCluster}
              toggleActivity={toggleActivity}
              resetFilters={resetFilters}
            />
          </aside>
        )}

        <main className="relative flex-1">
          {viewport.isMobile && !selectedAnalyst && (
            <>
              <div className="fixed left-4 right-4 z-40" style={{ top: viewport.topInset }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/75 px-4 py-3 backdrop-blur">
                    <div className={`flex gap-2 ${viewport.isCompactMobile ? 'flex-col' : 'items-start'}`}>
                      <div className="min-w-0 flex-[1.05]">
                        <p className={`font-orbitron uppercase text-sky-200 ${viewport.isCompactMobile ? 'text-[11px] tracking-[0.24em]' : 'text-sm tracking-[0.35em]'}`}>
                          Rosslyn Analyst Network
                        </p>
                        <p className="mt-1 text-xs text-slate-300">{filteredAnalysts.length} visible analysts</p>
                      </div>
                      {!selectedCluster && !selectedAnalyst && (
                        <div className={`min-w-0 ${viewport.isCompactMobile ? 'w-full' : 'flex-[0.95]'}`}>
                          <input
                            className="w-full rounded-xl border border-white/10 bg-slate-950/85 px-3 py-2 text-base text-white outline-none placeholder:text-slate-500 md:text-sm"
                            value={filters.nameSearch}
                            onChange={(event) => handleSearchChange(event.target.value)}
                            placeholder="SEARCH"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      className="rounded-full border border-white/15 bg-slate-950/75 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-100 backdrop-blur transition hover:border-sky-300 hover:text-white"
                      onClick={() => setMobileFiltersOpen(true)}
                    >
                      Filters
                    </button>
                    <button
                      className="rounded-full border border-white/15 bg-slate-950/75 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-100 backdrop-blur transition hover:border-sky-300 hover:text-white"
                      onClick={() => {
                        if (viewMode === '3d') {
                          setViewMode('2d')
                        } else {
                          setViewMode('3d')
                          setSelectedClusterId(null)
                          setSelectedAnalystId(null)
                          setCameraResetToken((value) => value + 1)
                        }
                      }}
                    >
                      {viewMode === '3d' ? 'List View' : '3D View'}
                    </button>
                  </div>
                </div>
              </div>

              {filters.nameSearch.trim() && (
                <div
                  className="fixed left-4 right-4 z-40"
                  style={{ top: viewport.isCompactMobile ? 'calc(env(safe-area-inset-top, 0px) + 7.5rem)' : 'calc(env(safe-area-inset-top, 0px) + 6.25rem)' }}
                >
                  <SearchMatchesPanel
                    analysts={filteredAnalysts}
                    searchValue={filters.nameSearch}
                    onClear={() => updateFilters({ nameSearch: '' })}
                    onSelectAnalyst={handleSelectAnalyst}
                    mobile
                    maxHeight={viewport.isCompactMobile ? '34vh' : '28vh'}
                  />
                </div>
              )}

              <div className="fixed left-4 z-40" style={{ bottom: viewport.bottomInset }}>
                <button
                  className="rounded-full border border-white/15 bg-slate-950/75 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-100 backdrop-blur transition hover:border-sky-300 hover:text-white"
                  onClick={filters.nameSearch.trim() ? resetToDefault : resetOverview}
                >
                  {filters.nameSearch.trim() ? 'Reset To Default' : 'Back To Overview'}
                </button>
              </div>
            </>
          )}

          {!viewport.isMobile && (
            <>
              <div className="absolute left-4 top-4 z-10 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Visible Analysts</p>
                <p className="mt-1 font-orbitron text-2xl text-white">{filteredAnalysts.length}</p>
              </div>
              <div className="absolute left-4 top-24 z-10">
                <button
                  className="rounded-full border border-white/15 bg-slate-950/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-100 backdrop-blur transition hover:border-sky-300 hover:text-white"
                  onClick={resetOverview}
                >
                  Back To Overview
                </button>
              </div>
            </>
          )}

          {isLoading ? (
            <CenterMessage title="Loading galaxy map..." subtitle="Pulling the latest network-map.json into the site." />
          ) : error ? (
            <CenterMessage title="Unable to load data" subtitle={error} />
          ) : viewMode === '3d' ? (
            <GalaxyScene
              analysts={analysts}
              clusters={clusters}
              filteredIds={filteredIds}
              viewport={viewport}
              onSelectAnalyst={handleSelectAnalyst}
              onSelectCluster={handleSelectCluster}
              selectedClusterId={selectedClusterId}
              focusedClusterId={selectedClusterId ?? searchFocusClusterId}
              selectedAnalystId={selectedAnalystId}
              cameraResetToken={cameraResetToken}
            />
          ) : (
            <ListView
              analysts={sortedTableRows}
              isMobile={viewport.isMobile}
              setSortKey={setSortKey}
              viewport={viewport}
              onSelectAnalyst={handleSelectAnalyst}
            />
          )}

          {!viewport.isMobile && viewMode === '3d' && filters.nameSearch.trim() && (
            <div className="absolute left-4 top-44 z-20 w-full max-w-[320px]">
              <SearchMatchesPanel
                analysts={filteredAnalysts}
                searchValue={filters.nameSearch}
                onClear={() => updateFilters({ nameSearch: '' })}
                onSelectAnalyst={handleSelectAnalyst}
                maxHeight="52vh"
              />
            </div>
          )}

          {selectedCluster && (!viewport.isMobile || !selectedAnalyst) && (
            <div
              className={`absolute z-30 border-white/10 bg-slate-950/85 backdrop-blur ${
                viewport.isMobile
                  ? 'inset-x-0 bottom-0 max-h-[62vh] rounded-t-[2rem] border-t p-5'
                  : 'right-0 top-0 h-full w-full max-w-[360px] border-l p-5'
              }`}
              style={
                viewport.isMobile
                  ? {
                      maxHeight: viewport.mobileOverlayMaxHeight,
                      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-orbitron text-2xl text-white">{selectedCluster.podName}</p>
                  <p className="mt-2 text-sm text-slate-300">{selectedCluster.shortVibe}</p>
                </div>
                <button className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200" onClick={() => setSelectedClusterId(null)}>
                  Close
                </button>
              </div>
              <div className="mt-5 space-y-4 text-sm text-slate-200">
                <PanelMetric label="Member Count" value={String(selectedCluster.memberCount)} />
                <PanelMetric label="Common Ground" value={selectedCluster.commonGround.join(', ') || 'None'} />
                <PanelMetric label="Top Activities" value={selectedCluster.topClusterActivities.join(', ')} />
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Members</p>
                  <div className="max-h-[34vh] space-y-2 overflow-auto pr-1">
                    {selectedCluster.members.map((memberId) => {
                      const analyst = analystMap.get(memberId)
                      if (!analyst) return null
                      return (
                        <button
                          key={analyst.id}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-sky-300/50 hover:bg-white/10"
                          onClick={() => handleSelectAnalyst(analyst.id)}
                        >
                          <div className="font-medium text-white">{analyst.name}</div>
                          <div className="text-xs text-slate-400">{analyst.personaTag}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedAnalyst && (
            <ProfileCard
              analyst={selectedAnalyst}
              analystsById={analystMap}
              onClose={() => handleSelectAnalyst(null)}
              onSelectAnalyst={handleSelectAnalyst}
              viewport={viewport}
            />
          )}

          {viewport.isMobile && mobileFiltersOpen && (
            <div className="absolute inset-0 z-40 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)}>
              <div
                className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-auto rounded-t-[2rem] border-t border-white/10 bg-[#06111c]/97 p-5"
                style={{
                  maxHeight: viewport.mobileDrawerMaxHeight,
                  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/20" />
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-orbitron text-lg text-white">Filters</p>
                    <p className="text-sm text-slate-400">Explore first, refine when you need to.</p>
                  </div>
                  <button className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200" onClick={() => setMobileFiltersOpen(false)}>
                    Close
                  </button>
                </div>
                <FilterControls
                  analysts={analysts}
                  clusters={clusters}
                  filters={filters}
                  offices={offices}
                  updateFilters={updateFilters}
                  toggleCluster={toggleCluster}
                  toggleActivity={toggleActivity}
                  resetFilters={resetFilters}
                  showSearch={!viewport.isMobile}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function SidebarHeader({
  viewMode,
  setViewMode,
}: {
  viewMode: '3d' | '2d'
  setViewMode: (value: '3d' | '2d') => void
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <p className="font-orbitron text-lg uppercase tracking-[0.35em] text-sky-200">Rosslyn Analyst Network</p>
        <p className="mt-2 text-sm text-slate-300">Professional & social alignment map for the full Rosslyn analyst cohort.</p>
      </div>
      <button
        className="rounded-full border border-white/15 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:border-sky-300 hover:text-white"
        onClick={() => setViewMode(viewMode === '3d' ? '2d' : '3d')}
      >
        {viewMode === '3d' ? 'List View' : '3D View'}
      </button>
    </div>
  )
}

function FilterControls({
  analysts,
  clusters,
  filters,
  offices,
  updateFilters,
  toggleCluster,
  toggleActivity,
  resetFilters,
  showSearch = true,
}: {
  analysts: Analyst[]
  clusters: Cluster[]
  filters: {
    nameSearch: string
    clusterIds: number[]
    personas: string[]
    activities: string[]
    office: string | null
  }
  offices: string[]
  updateFilters: (value: Partial<{ nameSearch: string; clusterIds: number[]; personas: string[]; activities: string[]; office: string | null }>) => void
  toggleCluster: (clusterId: number) => void
  toggleActivity: (activity: string) => void
  resetFilters: () => void
  showSearch?: boolean
}) {
  return (
    <div className="space-y-4">
      {showSearch && (
        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Search Name</label>
          <input
            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
            value={filters.nameSearch}
            onChange={(event) => updateFilters({ nameSearch: event.target.value })}
            placeholder="Search analysts"
          />
        </div>
      )}

      <FilterSection title="Clusters">
        <div className="flex flex-wrap gap-2">
          {clusters.map((cluster, index) => {
            const active = filters.clusterIds.includes(cluster.id)
            return (
              <button
                key={cluster.id}
                onClick={() => toggleCluster(cluster.id)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active ? 'border-white bg-white text-slate-950' : 'border-white/15 bg-white/5 text-slate-200 hover:border-white/40'
                }`}
                style={!active ? { boxShadow: `0 0 0 1px ${CLUSTER_COLORS[index % CLUSTER_COLORS.length]}33` } : undefined}
              >
                {cluster.podName}
              </button>
            )
          })}
        </div>
      </FilterSection>

      <FilterSection title="Activities">
        <div className="grid gap-2">
          {Object.keys(analysts[0]?.activityScores ?? {}).map((activity) => (
            <label key={activity} className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={filters.activities.includes(activity)} onChange={() => toggleActivity(activity)} />
              <span>{activity}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <div>
        <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Office</label>
        <select
          className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white"
          value={filters.office ?? ''}
          onChange={(event) => updateFilters({ office: event.target.value || null })}
        >
          <option value="">All offices</option>
          {offices.map((office) => (
            <option key={office} value={office}>
              {office}
            </option>
          ))}
        </select>
      </div>

      <button className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10" onClick={resetFilters}>
        Reset Filters
      </button>
    </div>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
      {children}
    </div>
  )
}

function CenterMessage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 text-center backdrop-blur">
        <p className="font-orbitron text-2xl text-white">{title}</p>
        <p className="mt-3 text-sm text-slate-300">{subtitle}</p>
      </div>
    </div>
  )
}

function PanelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  )
}

function ContactMetric({
  label,
  value,
  href,
}: {
  label: string
  value: string | null
  href?: string | null
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      {value ? (
        href ? (
          <a className="mt-1 inline-block text-sm text-sky-200 transition hover:text-white hover:underline" href={href} rel="noreferrer" target={href.startsWith('http') ? '_blank' : undefined}>
            {value}
          </a>
        ) : (
          <p className="mt-1 text-sm text-white">{value}</p>
        )
      ) : (
        <p className="mt-1 text-sm text-slate-500">Not provided</p>
      )}
    </div>
  )
}

function SearchMatchesPanel({
  analysts,
  searchValue,
  onClear,
  onSelectAnalyst,
  mobile = false,
  maxHeight,
}: {
  analysts: Analyst[]
  searchValue: string
  onClear: () => void
  onSelectAnalyst: (id: number | null) => void
  mobile?: boolean
  maxHeight?: string
}) {
  return (
    <div className={`rounded-[2rem] border border-white/10 bg-slate-950/82 p-4 backdrop-blur ${mobile ? 'shadow-2xl' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-orbitron text-sm uppercase tracking-[0.2em] text-sky-200">Search Matches</p>
          <p className="mt-1 text-xs text-slate-400">
            {analysts.length} match{analysts.length === 1 ? '' : 'es'} for "{searchValue}"
          </p>
        </div>
        <button
          className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 transition hover:border-sky-300 hover:text-white"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div className="mt-4 space-y-2 overflow-auto pr-1" style={maxHeight ? { maxHeight } : undefined}>
        {analysts.length > 0 ? (
          analysts.map((analyst) => (
            <button
              key={analyst.id}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:border-sky-300/50 hover:bg-white/10"
              onClick={() => onSelectAnalyst(analyst.id)}
            >
              <div className="font-medium text-white">{analyst.name}</div>
              <div className="mt-1 text-xs text-sky-100">
                {analyst.podName} | {analyst.personaTag}
              </div>
              <div className="mt-2 text-xs text-slate-400">{analyst.topActivities.join(', ') || 'No strong preferences'}</div>
            </button>
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-sm text-slate-400">No analyst names matched that search.</div>
        )}
      </div>
    </div>
  )
}

function ListView({
  analysts,
  isMobile,
  setSortKey,
  viewport,
  onSelectAnalyst,
}: {
  analysts: Analyst[]
  isMobile: boolean
  setSortKey: (value: 'name' | 'cluster' | 'persona') => void
  viewport: ViewportProfile
  onSelectAnalyst: (id: number | null) => void
}) {
  return (
    <div
      className="h-screen overflow-auto p-4"
      style={
        isMobile
          ? {
              paddingTop: viewport.isCompactMobile ? '9.5rem' : '7.5rem',
              paddingBottom: '6.5rem',
            }
          : {
              paddingTop: '5rem',
            }
      }
    >
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/75 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm" style={isMobile ? { minWidth: `${viewport.listMinWidth}px` } : undefined}>
            <thead className="sticky top-0 bg-slate-950/95 text-slate-300">
              <tr>
                <HeaderButton title="Name" onClick={() => setSortKey('name')} />
                <HeaderButton title="Cluster" onClick={() => setSortKey('cluster')} />
                {!isMobile && <HeaderButton title="Persona" onClick={() => setSortKey('persona')} />}
                <th className="px-4 py-3">Top Activities</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Instagram</th>
              </tr>
            </thead>
            <tbody>
              {analysts.map((analyst) => (
                <tr
                  key={analyst.id}
                  className={`border-t border-white/5 text-slate-100 ${isMobile ? 'cursor-pointer transition hover:bg-white/5' : ''}`}
                  onClick={isMobile ? () => onSelectAnalyst(analyst.id) : undefined}
                >
                  <td className="px-4 py-3">
                    {isMobile ? (
                      <button
                        className="text-left text-sky-100 transition hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectAnalyst(analyst.id)
                        }}
                      >
                        {analyst.name}
                      </button>
                    ) : (
                      analyst.name
                    )}
                  </td>
                  <td className="px-4 py-3">{analyst.podName}</td>
                  {!isMobile && <td className="px-4 py-3">{analyst.personaTag}</td>}
                  <td className="px-4 py-3">{analyst.topActivities.join(', ') || 'No strong preferences'}</td>
                  <td className="px-4 py-3">
                    {analyst.email ? (
                      <a className="text-sky-200 transition hover:text-white hover:underline" href={`mailto:${analyst.email}`}>
                        {analyst.email}
                      </a>
                    ) : (
                      <span className="text-slate-500">Not provided</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {analyst.phone ? (
                      <a className="text-sky-200 transition hover:text-white hover:underline" href={`tel:${analyst.phone}`}>
                        {analyst.phone}
                      </a>
                    ) : (
                      <span className="text-slate-500">Not provided</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {analyst.instagramUsername ? (
                      <a className="text-sky-200 transition hover:text-white hover:underline" href={`https://instagram.com/${normalizeInstagramHandle(analyst.instagramUsername)}`} rel="noreferrer" target="_blank">
                        {formatInstagramLabel(analyst.instagramUsername)}
                      </a>
                    ) : (
                      <span className="text-slate-500">Not provided</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function HeaderButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <th className="px-4 py-3">
      <button className="font-medium text-slate-200 transition hover:text-white" onClick={onClick}>
        {title}
      </button>
    </th>
  )
}

function ProfileCard({
  analyst,
  analystsById,
  onClose,
  onSelectAnalyst,
  viewport,
}: {
  analyst: Analyst
  analystsById: Map<number, Analyst>
  onClose: () => void
  onSelectAnalyst: (id: number | null) => void
  viewport: ViewportProfile
}) {
  return (
    <div className="absolute inset-0 z-[70] overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto my-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#06111c]/95 shadow-2xl backdrop-blur"
        style={{ maxHeight: viewport.popupMaxHeight }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#06111c]/98 px-5 pb-4 pt-5 md:px-6 md:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-orbitron text-2xl text-white">{analyst.name}</p>
              <div className="mt-2 inline-flex rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky-100">
                {analyst.personaTag}
              </div>
            </div>
            <button className="rounded-full border border-white/15 px-3 py-1 text-sm text-slate-200" onClick={onClose}>
              X
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-5 pr-4 md:px-6 md:pb-6 md:pt-6 md:pr-5" style={{ maxHeight: viewport.popupBodyMaxHeight }}>
          <div className="space-y-5 text-sm text-slate-200">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">About Me</p>
              <p className="mt-1 leading-6 text-slate-200">{analyst.aboutMe ?? 'No bio provided.'}</p>
            </div>
            <PanelMetric label="Cluster Vibe" value={analyst.shortVibe} />
            <PanelMetric label="Top Activities" value={analyst.topActivities.join(', ') || 'No strong preferences'} />
            <div className="grid gap-4 md:grid-cols-3">
              <ContactMetric label="Email" value={analyst.email} href={analyst.email ? `mailto:${analyst.email}` : null} />
              <ContactMetric label="Phone" value={analyst.phone} href={analyst.phone ? `tel:${analyst.phone}` : null} />
              <ContactMetric
                label="Instagram"
                value={formatInstagramLabel(analyst.instagramUsername)}
                href={analyst.instagramUsername ? `https://instagram.com/${normalizeInstagramHandle(analyst.instagramUsername)}` : null}
              />
            </div>
          </div>
          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Closest Matches</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {analyst.closestMatches.map((matchId) => {
                const match = analystsById.get(matchId)
                if (!match) return null
                return (
                  <button
                    key={match.id}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:border-sky-300/50 hover:bg-white/10"
                    onClick={() => onSelectAnalyst(match.id)}
                  >
                    <div className="font-medium text-white">{match.name}</div>
                    <div className="mt-1 text-xs text-sky-100">{match.podName}</div>
                    <div className="mt-2 text-xs text-slate-400">{match.topActivities.join(', ') || 'No strong preferences'}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GalaxyScene({
  analysts,
  clusters,
  filteredIds,
  viewport,
  onSelectAnalyst,
  onSelectCluster,
  selectedClusterId,
  focusedClusterId,
  selectedAnalystId,
  cameraResetToken,
}: {
  analysts: Analyst[]
  clusters: Cluster[]
  filteredIds: Set<number>
  viewport: ViewportProfile
  onSelectAnalyst: (id: number | null) => void
  onSelectCluster: (id: number | null) => void
  selectedClusterId: number | null
  focusedClusterId: number | null
  selectedAnalystId: number | null
  cameraResetToken: number
}) {
  const controlsRef = useRef<any>(null)
  const isMobile = viewport.isMobile
  const clusterCenters = useMemo(() => {
    const entries = new Map<number, THREE.Vector3>()
    clusters.forEach((cluster) => {
      const members = analysts.filter((analyst) => analyst.clusterId === cluster.id)
      const average = members.reduce((acc, analyst) => acc.add(new THREE.Vector3(analyst.coordinates.x, analyst.coordinates.y, analyst.coordinates.z)), new THREE.Vector3())
      average.divideScalar(Math.max(members.length, 1))
      entries.set(cluster.id, average)
    })
    return entries
  }, [analysts, clusters])

  return (
    <div className="h-screen w-full">
      <Canvas
        camera={{ position: [0, 0, 150], fov: viewport.galaxyFov }}
        onPointerMissed={() => {
          onSelectAnalyst(null)
          onSelectCluster(null)
        }}
      >
        <color attach="background" args={['#020408']} />
        <fog attach="fog" args={['#020408', isMobile ? 55 : 66, viewport.galaxyFogFar]} />
        <ambientLight intensity={isMobile ? (viewport.isCompactMobile ? 1.68 : 1.56) : 1.5} />
        <pointLight position={[20, 20, 25]} intensity={isMobile ? (viewport.isCompactMobile ? 102 : 96) : 104} color="#d2f0ff" />
        <Stars radius={150} depth={75} count={isMobile ? 3600 : 3400} factor={isMobile ? (viewport.isCompactMobile ? 6 : 5.5) : 5.4} fade speed={0.34} />
        <FocusController
          clusterCenters={clusterCenters}
          controlsRef={controlsRef}
          focusedClusterId={focusedClusterId}
          isMobile={viewport.isMobile}
          cameraResetToken={cameraResetToken}
        />
        <OrbitControls
          ref={controlsRef}
          enablePan={!isMobile}
          enableDamping
          dampingFactor={0.08}
          minDistance={isMobile ? 30 : 35}
          maxDistance={isMobile ? 240 : 220}
        />

        {clusters.map((cluster, index) => {
          const center = clusterCenters.get(cluster.id) ?? new THREE.Vector3()
          const color = CLUSTER_COLORS[index % CLUSTER_COLORS.length]
          const radius = Math.max(8, Math.min(18, cluster.memberCount / 2))
          return (
            <group key={cluster.id}>
              <mesh position={center} onClick={() => onSelectCluster(cluster.id)}>
                <sphereGeometry args={[radius, 32, 32]} />
                <meshBasicMaterial color={color} transparent opacity={selectedClusterId === cluster.id ? (isMobile ? 0.22 : 0.22) : isMobile ? 0.15 : 0.18} wireframe />
              </mesh>
              <mesh position={center}>
                <torusGeometry args={[radius + 1.4, 0.12, 12, 80]} />
                <meshBasicMaterial color={color} transparent opacity={isMobile ? 0.62 : 0.62} />
              </mesh>
            </group>
          )
        })}

        {analysts.map((analyst) => {
          const clusterIndex = clusters.findIndex((cluster) => cluster.id === analyst.clusterId)
          const color = CLUSTER_COLORS[(clusterIndex >= 0 ? clusterIndex : 0) % CLUSTER_COLORS.length]
          const isVisible = filteredIds.has(analyst.id)
          const isSelected = analyst.id === selectedAnalystId
          return (
            <Sphere
              key={analyst.id}
              args={[isSelected ? 0.9 : 0.55, isMobile ? 10 : 14, isMobile ? 10 : 14]}
              position={[analyst.coordinates.x, analyst.coordinates.y, analyst.coordinates.z]}
              onClick={(event) => {
                event.stopPropagation()
                onSelectAnalyst(analyst.id)
              }}
            >
              <meshStandardMaterial
                color={color}
                emissive={new THREE.Color(color)}
                emissiveIntensity={isSelected ? 3.2 : isVisible ? (isMobile ? 2.15 : 2.2) : isMobile ? 0.48 : 0.62}
                opacity={isVisible ? 1 : isMobile ? 0.32 : 0.4}
                transparent
              />
            </Sphere>
          )
        })}
      </Canvas>
    </div>
  )
}

function FocusController({
  clusterCenters,
  controlsRef,
  focusedClusterId,
  isMobile,
  cameraResetToken,
}: {
  clusterCenters: Map<number, THREE.Vector3>
  controlsRef: MutableRefObject<any>
  focusedClusterId: number | null
  isMobile: boolean
  cameraResetToken: number
}) {
  const { camera } = useThree()
  const defaultPosition = useRef(new THREE.Vector3(0, 0, 150))
  const defaultTarget = useRef(new THREE.Vector3(0, 0, 0))
  const animationRef = useRef<{
    startedAt: number
    duration: number
    startPos: THREE.Vector3
    endPos: THREE.Vector3
    startTarget: THREE.Vector3
    endTarget: THREE.Vector3
  } | null>(null)
  const previousClusterId = useRef<number | null>(null)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    animationRef.current = {
      startedAt: performance.now(),
      duration: 850,
      startPos: camera.position.clone(),
      endPos: defaultPosition.current.clone(),
      startTarget: controls.target.clone(),
      endTarget: defaultTarget.current.clone(),
    }
    previousClusterId.current = null
  }, [camera, cameraResetToken, controlsRef])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || focusedClusterId === previousClusterId.current) {
      previousClusterId.current = focusedClusterId
      return
    }
    if (focusedClusterId === null) {
      animationRef.current = {
        startedAt: performance.now(),
        duration: 850,
        startPos: camera.position.clone(),
        endPos: defaultPosition.current.clone(),
        startTarget: controls.target.clone(),
        endTarget: defaultTarget.current.clone(),
      }
    } else {
      const target = clusterCenters.get(focusedClusterId)
      if (!target) {
        previousClusterId.current = focusedClusterId
        return
      }
      const direction = new THREE.Vector3(1.2, 0.55, 1.15).normalize()
      const distance = isMobile ? 34 : 42
      animationRef.current = {
        startedAt: performance.now(),
        duration: 900,
        startPos: camera.position.clone(),
        endPos: target.clone().add(direction.multiplyScalar(distance)),
        startTarget: controls.target.clone(),
        endTarget: target.clone(),
      }
    }
    previousClusterId.current = focusedClusterId
  }, [camera, clusterCenters, controlsRef, focusedClusterId, isMobile])

  useFrame(() => {
    const animation = animationRef.current
    const controls = controlsRef.current
    if (!animation || !controls) return
    const elapsed = performance.now() - animation.startedAt
    const progress = Math.min(elapsed / animation.duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    camera.position.lerpVectors(animation.startPos, animation.endPos, eased)
    controls.target.lerpVectors(animation.startTarget, animation.endTarget, eased)
    controls.update()
    if (progress >= 1) {
      animationRef.current = null
    }
  })
  return null
}

export default App
