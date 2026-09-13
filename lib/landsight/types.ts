export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ProjectType = 'Highway' | 'Railway' | 'Irrigation' | 'Power' | 'Industrial' | 'Road infrastructure'
export type Role = 'Admin' | 'State/District Officer' | 'Project Manager'
export interface User { id: string; name: string; role: Role; mode: 'role-preview' }
export interface RiskFactor { id: string; name: string; contribution: number; description: string }
export interface RiskPrediction { score: number; level: RiskLevel; delayDays: number; confidence: number; factors: RiskFactor[]; model: string; isDemo: true }
export interface ProjectStage { name: string; completion: number; risk: RiskLevel; status: 'Complete' | 'In progress' | 'Needs attention' | 'Not started'; delayDays: number }
export interface Project {
  id: string; name: string; state: string; district: string; type: ProjectType
  totalParcels: number; acquiredParcels: number; pendingParcels: number; landowners: number
  compensationPaid: number; compensationBudgetCr: number; legalCases: number
  approvalDays: number; approvalsPending: number; clearanceStatus: string; complexity: number
  progress: number; expectedCompletion: string; latitude: number; longitude: number
  riskScore: number; expectedDelay: number; riskLevel: RiskLevel; riskChange: number
  primaryRisk: string; status: 'On track' | 'At risk' | 'Delayed'; prediction: RiskPrediction; stages: ProjectStage[]
  source: 'Synthetic'; agency: string
}
export interface Recommendation { id: string; projectId: string; title: string; priority: RiskLevel; reason: string; impact: string; action: string; owner: string }
export interface Alert { id: string; projectId: string; projectName: string; severity: RiskLevel; category: string; reason: string; date: string; action: string; status: 'Open' | 'Acknowledged' | 'Resolved' }
export interface SimulationInput { compensationPaid: number; legalCases: number; approvalDays: number; acquiredParcels: number }
export interface SimulationResult { projectId: string; current: RiskPrediction; simulated: RiskPrediction; riskReduction: number; daysSaved: number; input: SimulationInput; isDemo: true }
export interface AuditLog {
  id: string
  user: string
  role: Role | 'Demo engine'
  action: string
  module: string
  project: string
  details: string
  timestamp: string
  result: 'Success' | 'Reviewed' | 'Validated' | 'Needs correction' | 'Failed'
  source: 'Synthetic' | 'This session'
}
export interface AuditContext { module?: string; details?: string; role?: Role }
export interface Filters { state: string; district: string; type: string; risk: string; search: string; progress: string; status: string }
export interface DashboardSummary { total: number; highRisk: number; critical: number; progress: number; pending: number; atRiskPercent: number; averageDelay: number; states: number }
export interface ImportRecord { id: string; name: string; rows: number; valid: number; errors: string[]; date: string; source: 'Uploaded — validation only' }
export interface ConfusionMatrix { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number }
export interface ModelPerformance {
  version: string
  lastTrained: string
  trainingRecords: number
  features: number
  metrics: { name: string; value: string; description: string }[]
  confusionMatrix: ConfusionMatrix
  featureImportance: { name: string; importance: number }[]
  isDemo: true
}
export interface LandSightService {
  getProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project | undefined>
  getDashboard(projects: Project[]): Promise<DashboardSummary>
  predict(project: Project): Promise<RiskPrediction>
  getExplanation(id: string): Promise<RiskFactor[]>
  getRecommendations(id?: string): Promise<Recommendation[]>
  simulate(project: Project, input: SimulationInput): Promise<SimulationResult>
  getGISProjects(): Promise<Project[]>
  getAlerts(): Promise<Alert[]>
  validateUpload(file: File): Promise<ImportRecord>
  getModelPerformance(): Promise<ModelPerformance>
}
