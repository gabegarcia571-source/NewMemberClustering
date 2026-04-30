import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sphere, Stars } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import { useAppStore } from './store'
import type { Analyst, Cluster, NetworkMap } from './types'

const CLUSTER_COLORS = ['#4FC3F7', '#81C784', '#FFB74D', '#F06292', '#CE93D8', '#4DB6AC', '#FFF176', '#FF8A65', '#90CAF9', '#A5D6A7']

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
    togglePersona,
    toggleActivity,
  } = useAppStore()

  const [sortKey, setSortKey] = useState<'name' | 'cluster' | 'persona'>('name')
  const [cameraResetToken, setCameraResetToken] = useState(0)
  const isMobile = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0

  useEffect(() => {
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
  }, [setData, setError, setLoading])

  const analystMap = useMemo(() => new Map(analysts.map((analyst) => [analyst.id, analyst])), [analysts])
  const clusterMap = useMemo(() => new Map(clusters.map((cluster) => [cluster.id, cluster])), [clusters])

  const filteredAnalysts = useMemo(() => {
    return analysts.filter((analyst) => {
      const nameMatch = !filters.nameSearch || analyst.name.toLowerCase().includes(filters.nameSearch.toLowerCase())
      const clusterMatch = filters.clusterIds.length === 0 || filters.clusterIds.includes(analyst.clusterId)
      const personaMatch = filters.personas.length === 0 || filters.personas.includes(analyst.personaTag)
      const activityMatch =
        filters.activities.length === 0 ||
        filters.activities.every((activity) => analyst.topActivities.includes(activity) || analyst.activityScores[activity] > 0)
      const officeMatch = !filters.office || analyst.office === filters.office
      return nameMatch && clusterMatch && personaMatch && activityMatch && officeMatch
    })
  }, [analysts, filters])

  const filteredIds = useMemo(() => new Set(filteredAnalysts.map((analyst) => analyst.id)), [filteredAnalysts])
  const personas = useMemo(
    () => Array.from(new Set(analysts.map((analyst) => analyst.personaTag))).filter((persona) => persona !== 'Persona Unspecified').sort(),
    [analysts],
  )
  const offices = useMemo(() => Array.from(new Set(analysts.map((analyst) => analyst.office))).sort(), [analysts])
  const selectedAnalyst = selectedAnalystId !== null ? analystMap.get(selectedAnalystId) ?? null : null
  const selectedCluster = selectedClusterId !== null ? clusterMap.get(selectedClusterId) ?? null : null

  const sortedTableRows = useMemo(() => {
    const rows = [...filteredAnalysts]
    rows.sort((a, b) => {
      if (sortKey === 'cluster') return a.podName.localeCompare(b.podName) || a.name.localeCompare(b.name)
      if (sortKey === 'persona') return a.personaTag.localeCompare(b.personaTag) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
    return rows
  }, [filteredAnalysts, sortKey])

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col lg:flex-row">
        <aside className="border-b border-white/10 bg-white/5 p-4 backdrop-blur lg:w-[320px] lg:border-b-0 lg:border-r">
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

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Search Name</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
                value={filters.nameSearch}
                onChange={(event) => updateFilters({ nameSearch: event.target.value })}
                placeholder="Search analysts"
              />
            </div>

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

            <FilterSection title="Persona">
              <div className="grid grid-cols-2 gap-2">
                {personas.map((persona) => (
                  <label key={persona} className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={filters.personas.includes(persona)} onChange={() => togglePersona(persona)} />
                    <span>{persona}</span>
                  </label>
                ))}
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
        </aside>

        <main className="relative flex-1">
          <div className="absolute left-4 top-4 z-10 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Visible Analysts</p>
            <p className="mt-1 font-orbitron text-2xl text-white">{filteredAnalysts.length}</p>
          </div>
          <div className="absolute left-4 top-24 z-10">
            <button
              className="rounded-full border border-white/15 bg-slate-950/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-100 backdrop-blur transition hover:border-sky-300 hover:text-white"
              onClick={() => {
                setSelectedClusterId(null)
                setSelectedAnalystId(null)
                setCameraResetToken((value) => value + 1)
              }}
            >
              Back To Overview
            </button>
          </div>

          {isLoading ? (
            <CenterMessage title="Loading galaxy map..." subtitle="Pulling the latest network-map.json into the site." />
          ) : error ? (
            <CenterMessage title="Unable to load data" subtitle={error} />
          ) : viewMode === '3d' ? (
            <GalaxyScene
              analysts={analysts}
              clusters={clusters}
              filteredIds={filteredIds}
              isMobile={isMobile}
              onSelectAnalyst={setSelectedAnalystId}
              onSelectCluster={setSelectedClusterId}
              selectedClusterId={selectedClusterId}
              selectedAnalystId={selectedAnalystId}
              cameraResetToken={cameraResetToken}
            />
          ) : (
            <ListView analysts={sortedTableRows} setSortKey={setSortKey} />
          )}

          {selectedCluster && (
            <div className="absolute right-0 top-0 z-10 h-full w-full max-w-[360px] border-l border-white/10 bg-slate-950/80 p-5 backdrop-blur">
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
                  <div className="max-h-[44vh] space-y-2 overflow-auto pr-1">
                    {selectedCluster.members.map((memberId) => {
                      const analyst = analystMap.get(memberId)
                      if (!analyst) return null
                      return (
                        <button
                          key={analyst.id}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-sky-300/50 hover:bg-white/10"
                          onClick={() => setSelectedAnalystId(analyst.id)}
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

          {selectedAnalyst && <ProfileCard analyst={selectedAnalyst} analystsById={analystMap} onClose={() => setSelectedAnalystId(null)} onSelectAnalyst={setSelectedAnalystId} />}
        </main>
      </div>
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

function ListView({ analysts, setSortKey }: { analysts: Analyst[]; setSortKey: (value: 'name' | 'cluster' | 'persona') => void }) {
  return (
    <div className="h-screen overflow-auto p-4 pt-20">
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/75 backdrop-blur">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-950/95 text-slate-300">
            <tr>
              <HeaderButton title="Name" onClick={() => setSortKey('name')} />
              <HeaderButton title="Cluster" onClick={() => setSortKey('cluster')} />
              <HeaderButton title="Persona" onClick={() => setSortKey('persona')} />
              <th className="px-4 py-3">Top Activities</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Instagram</th>
              <th className="px-4 py-3">Office</th>
            </tr>
          </thead>
          <tbody>
            {analysts.map((analyst) => (
              <tr key={analyst.id} className="border-t border-white/5 text-slate-100">
                <td className="px-4 py-3">{analyst.name}</td>
                <td className="px-4 py-3">{analyst.podName}</td>
                <td className="px-4 py-3">{analyst.personaTag}</td>
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
                    <a
                      className="text-sky-200 transition hover:text-white hover:underline"
                      href={`https://instagram.com/${analyst.instagramUsername.replace(/^@/, '')}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {analyst.instagramUsername}
                    </a>
                  ) : (
                    <span className="text-slate-500">Not provided</span>
                  )}
                </td>
                <td className="px-4 py-3">{analyst.office}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
}: {
  analyst: Analyst
  analystsById: Map<number, Analyst>
  onClose: () => void
  onSelectAnalyst: (id: number) => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#06111c]/95 p-6 shadow-2xl backdrop-blur" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-orbitron text-2xl text-white">{analyst.name}</p>
            <div className="mt-2 inline-flex rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky-100">
              {analyst.personaTag}
            </div>
          </div>
          <button className="rounded-full border border-white/15 px-3 py-1 text-sm text-slate-200" onClick={onClose}>
            X
          </button>
        </div>
        <div className="mt-6 grid gap-5 text-sm text-slate-200 md:grid-cols-2">
          <div className="space-y-3">
            <PanelMetric label="Pod" value={analyst.podName} />
            <PanelMetric label="Top Activities" value={analyst.topActivities.join(', ') || 'No strong preferences'} />
            <PanelMetric label="Email" value={analyst.email ?? 'Not provided'} />
            <PanelMetric label="Phone" value={analyst.phone ?? 'Not provided'} />
            <PanelMetric label="Instagram" value={analyst.instagramUsername ?? 'Not provided'} />
          </div>
          <div className="space-y-3">
            <PanelMetric label="Office" value={analyst.office} />
            <PanelMetric label="Cluster Vibe" value={analyst.shortVibe} />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">About Me</p>
              <p className="mt-1 leading-6 text-slate-200">{analyst.aboutMe ?? 'No bio provided.'}</p>
            </div>
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
  )
}

function GalaxyScene({
  analysts,
  clusters,
  filteredIds,
  isMobile,
  onSelectAnalyst,
  onSelectCluster,
  selectedClusterId,
  selectedAnalystId,
  cameraResetToken,
}: {
  analysts: Analyst[]
  clusters: Cluster[]
  filteredIds: Set<number>
  isMobile: boolean
  onSelectAnalyst: (id: number | null) => void
  onSelectCluster: (id: number | null) => void
  selectedClusterId: number | null
  selectedAnalystId: number | null
  cameraResetToken: number
}) {
  const controlsRef = useRef<any>(null)
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
        camera={{ position: [0, 0, 150], fov: isMobile ? 62 : 55 }}
        onPointerMissed={() => {
          onSelectAnalyst(null)
          onSelectCluster(null)
        }}
      >
        <color attach="background" args={['#020408']} />
        <fog attach="fog" args={['#020408', 80, 220]} />
        <ambientLight intensity={1.15} />
        <pointLight position={[20, 20, 25]} intensity={70} color="#9ed8ff" />
        <Stars radius={140} depth={60} count={3000} factor={4} fade speed={0.4} />
        <FocusController
          clusterCenters={clusterCenters}
          controlsRef={controlsRef}
          selectedClusterId={selectedClusterId}
          isMobile={isMobile}
          cameraResetToken={cameraResetToken}
        />
        <OrbitControls ref={controlsRef} enablePan={!isMobile} enableDamping dampingFactor={0.08} minDistance={35} maxDistance={220} />

        {clusters.map((cluster, index) => {
          const center = clusterCenters.get(cluster.id) ?? new THREE.Vector3()
          const color = CLUSTER_COLORS[index % CLUSTER_COLORS.length]
          const radius = Math.max(8, Math.min(18, cluster.memberCount / 2))
          return (
            <group key={cluster.id}>
              <mesh position={center} onClick={() => onSelectCluster(cluster.id)}>
                <sphereGeometry args={[radius, 32, 32]} />
                <meshBasicMaterial color={color} transparent opacity={selectedClusterId === cluster.id ? 0.12 : 0.05} wireframe />
              </mesh>
              <mesh position={center}>
                <torusGeometry args={[radius + 1.4, 0.12, 12, 80]} />
                <meshBasicMaterial color={color} transparent opacity={0.35} />
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
                emissiveIntensity={isSelected ? 2.8 : isVisible ? 1.4 : 0.18}
                opacity={isVisible ? 0.95 : 0.12}
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
  selectedClusterId,
  isMobile,
  cameraResetToken,
}: {
  clusterCenters: Map<number, THREE.Vector3>
  controlsRef: MutableRefObject<any>
  selectedClusterId: number | null
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
    if (!controls || selectedClusterId === previousClusterId.current) {
      previousClusterId.current = selectedClusterId
      return
    }
    if (selectedClusterId === null) {
      animationRef.current = {
        startedAt: performance.now(),
        duration: 850,
        startPos: camera.position.clone(),
        endPos: defaultPosition.current.clone(),
        startTarget: controls.target.clone(),
        endTarget: defaultTarget.current.clone(),
      }
    } else {
      const target = clusterCenters.get(selectedClusterId)
      if (!target) {
        previousClusterId.current = selectedClusterId
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
    previousClusterId.current = selectedClusterId
  }, [camera, clusterCenters, controlsRef, isMobile, selectedClusterId])

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
