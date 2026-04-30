export interface ActivityScores {
  [activityName: string]: number
}

export interface Analyst {
  id: number
  name: string
  office: string
  email: string | null
  phone: string | null
  instagramUsername: string | null
  aboutMe: string | null
  personaTag: string
  personaConfidence: number
  runnerUpPersona: string | null
  topActivities: string[]
  activityScores: ActivityScores
  clusterId: number
  podName: string
  shortVibe: string
  slug: string
  closestMatches: number[]
  coordinates: { x: number; y: number; z: number }
}

export interface Cluster {
  id: number
  podName: string
  shortVibe: string
  memberCount: number
  centroidScores: ActivityScores
  topClusterActivities: string[]
  commonGround: string[]
  fallbackSharedInterests: boolean
  members: number[]
}

export interface ClusterEvaluation {
  testedK: Array<{
    k: number
    silhouetteScore: number
    clusterSizes: number[]
    minClusterSize: number
    maxClusterSize: number
    passedMinSize: boolean
  }>
  selectedK: number
  selectionReasoning: string
}

export interface NetworkMap {
  analysts: Analyst[]
  clusters: Cluster[]
  clusterEvaluation: ClusterEvaluation
  metadata: {
    totalAnalysts: number
    generatedAt: string
    sourceWorkbook: string
  }
}
