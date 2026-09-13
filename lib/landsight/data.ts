import type { Alert, AuditLog, ModelPerformance, Project, ProjectType, Recommendation, Role } from './types'
import { getStages, predictRisk } from './risk'

export const SNAPSHOT_DATE = '2026-09-13'
export const DEMO_NOTICE = 'DEMO / SYNTHETIC DATA — For Demonstration Only'
export const ROLE_PROFILES: Record<Role, { name: string; title: string; eyebrow: string; focus: string; action: string; href: string }> = {
  Admin: { name: 'Aarav Sharma', title: 'Executive dashboard', eyebrow: 'NATIONAL ACQUISITION OVERVIEW', focus: 'Coordinate high-risk interventions, data quality, and portfolio-wide oversight.', action: 'Explore risk analysis', href: '/risk-analysis' },
  'State/District Officer': { name: 'Priya Verma', title: 'Regional officer dashboard', eyebrow: 'STATE & DISTRICT OVERSIGHT', focus: 'Prioritize legal cases, pending compensation, and district clearance bottlenecks. Use the geographic filters to focus your review.', action: 'Compare districts', href: '/analytics' },
  'Project Manager': { name: 'Arjun Mehta', title: 'Project delivery dashboard', eyebrow: 'PROJECT DELIVERY PRIORITIES', focus: 'Focus on pending possession and clearances, then test interventions against the predicted delivery delay.', action: 'Test an intervention', href: '/simulation' },
}
export const PROJECT_TYPES: ProjectType[] = ['Highway', 'Railway', 'Irrigation', 'Power', 'Industrial', 'Road infrastructure']
type Seed = [name: string, state: string, district: string, type: ProjectType, totalParcels: number, acquiredParcels: number, compensationPaid: number, legalCases: number, approvalDays: number, complexity: number, latitude: number, longitude: number]
const seeds: Seed[] = [
  ['Eastern Freight Corridor — Patna', 'Bihar', 'Patna', 'Railway', 1240, 310, 28, 23, 110, 5, 25.5941, 85.1376],
  ['Pune Ring Road — Eastern Section', 'Maharashtra', 'Pune', 'Highway', 1860, 632, 35, 18, 95, 5, 18.5204, 73.8567],
  ['Varanasi–Ghazipur Highway', 'Uttar Pradesh', 'Varanasi', 'Highway', 980, 382, 42, 16, 90, 4, 25.3176, 82.9739],
  ['Bengaluru Peripheral Rail Link', 'Karnataka', 'Bengaluru Rural', 'Railway', 720, 317, 48, 14, 85, 4, 13.2257, 77.5750],
  ['Brahmaputra Irrigation Extension', 'Assam', 'Kamrup', 'Irrigation', 860, 258, 30, 21, 105, 5, 26.1445, 91.7362],
  ['Nagpur Industrial Growth Centre', 'Maharashtra', 'Nagpur', 'Industrial', 1120, 650, 58, 11, 60, 3, 21.1458, 79.0882],
  ['Jaipur Northern Bypass', 'Rajasthan', 'Jaipur', 'Road infrastructure', 650, 442, 72, 5, 35, 3, 26.9124, 75.7873],
  ['Surat Green Energy Corridor', 'Gujarat', 'Surat', 'Power', 540, 459, 88, 2, 15, 2, 21.1702, 72.8311],
  ['Chennai Logistics Park', 'Tamil Nadu', 'Tiruvallur', 'Industrial', 910, 400, 45, 15, 80, 4, 13.1437, 79.9089],
  ['Hyderabad Regional Ring Road', 'Telangana', 'Rangareddy', 'Highway', 1680, 722, 40, 19, 100, 4, 17.2543, 78.2040],
  ['Indore–Dewas Road Widening', 'Madhya Pradesh', 'Indore', 'Road infrastructure', 430, 370, 91, 1, 10, 2, 22.7196, 75.8577],
  ['Mahanadi Canal Modernisation', 'Odisha', 'Cuttack', 'Irrigation', 780, 429, 60, 9, 55, 3, 20.4625, 85.8830],
  ['Kochi Eastern Mobility Corridor', 'Kerala', 'Ernakulam', 'Road infrastructure', 610, 348, 62, 10, 45, 4, 9.9816, 76.2999],
  ['Ludhiana Rail Freight Terminal', 'Punjab', 'Ludhiana', 'Railway', 420, 344, 85, 3, 20, 2, 30.9010, 75.8573],
  ['Ranchi Power Transmission Link', 'Jharkhand', 'Ranchi', 'Power', 590, 236, 38, 17, 95, 4, 23.3441, 85.3096],
  ['Raipur Integrated Industrial Area', 'Chhattisgarh', 'Raipur', 'Industrial', 1040, 614, 64, 8, 50, 3, 21.2514, 81.6296],
  ['Lucknow Outer Ring Extension', 'Uttar Pradesh', 'Lucknow', 'Highway', 890, 534, 67, 7, 45, 3, 26.8467, 80.9462],
  ['Ahmedabad–Mehsana Rail Upgrade', 'Gujarat', 'Ahmedabad', 'Railway', 680, 578, 90, 2, 12, 2, 23.0225, 72.5714],
  ['Krishna Basin Lift Irrigation', 'Andhra Pradesh', 'Krishna', 'Irrigation', 1150, 483, 46, 15, 90, 4, 16.5062, 80.6480],
  ['Jodhpur Solar Evacuation Line', 'Rajasthan', 'Jodhpur', 'Power', 350, 322, 96, 0, 5, 1, 26.2389, 73.0243],
  ['Coimbatore Western Bypass', 'Tamil Nadu', 'Coimbatore', 'Road infrastructure', 570, 399, 76, 4, 30, 3, 11.0168, 76.9558],
  ['Mysuru Industrial Access Road', 'Karnataka', 'Mysuru', 'Industrial', 460, 377, 87, 2, 18, 2, 12.2958, 76.6394],
  ['Siliguri Connectivity Corridor', 'West Bengal', 'Darjeeling', 'Highway', 740, 237, 32, 20, 110, 5, 26.7271, 88.3953],
  ['Dehradun Regional Road Link', 'Uttarakhand', 'Dehradun', 'Road infrastructure', 390, 269, 73, 5, 32, 4, 30.3165, 78.0322],
]
export const PROJECTS: Project[] = seeds.map((s, index) => {
  const [name, state, district, type, totalParcels, acquiredParcels, compensationPaid, legalCases, approvalDays, complexity, latitude, longitude] = s
  const inputs = { totalParcels, acquiredParcels, compensationPaid, legalCases, approvalDays, complexity }
  const prediction = predictRisk(inputs)
  return { ...inputs, id: `LS-2026-${String(index + 1).padStart(3, '0')}`, name, state, district, type, latitude, longitude, pendingParcels: totalParcels - acquiredParcels, landowners: Math.round(totalParcels * (1 + complexity * .12)), compensationBudgetCr: Math.round(totalParcels * .38), approvalsPending: approvalDays > 80 ? 3 : approvalDays > 30 ? 2 : approvalDays > 0 ? 1 : 0, clearanceStatus: approvalDays > 60 ? 'Clearances delayed' : 'Under review', progress: Math.round(acquiredParcels / totalParcels * 100), expectedCompletion: index < 8 ? '2026-12-31' : index < 16 ? '2027-03-31' : '2027-06-30', riskScore: prediction.score, expectedDelay: prediction.delayDays, riskLevel: prediction.level, riskChange: prediction.score > 80 ? 8 : prediction.score > 60 ? 4 : -5, primaryRisk: [...prediction.factors].sort((a, b) => b.contribution - a.contribution)[0].name, status: prediction.score > 80 ? 'Delayed' : prediction.score > 60 ? 'At risk' : 'On track', prediction, stages: getStages(inputs), source: 'Synthetic', agency: `${state} Project Coordination Unit (demo)` }
})
export function recommendationsFor(p: Project): Recommendation[] {
  const result: Recommendation[] = []
  const add = (id: string, title: string, reason: string, impact: string, action: string, owner: string) => result.push({ id: `${p.id}-${id}`, projectId: p.id, title, priority: p.riskLevel, reason, impact, action, owner })
  if (p.compensationPaid < 80) add('compensation', 'Prioritize pending compensation cases', `${100 - p.compensationPaid}% of the ₹${p.compensationBudgetCr} Cr compensation budget remains unsettled.`, 'A 20-point improvement reduces the demo risk by about 6 points.', 'Hold a joint valuation and disbursement camp; review disputed awards with affected landowners.', 'District Land Acquisition Officer')
  if (p.legalCases > 3) add('legal', 'Escalate unresolved legal cases', `${p.legalCases} open cases are restricting land possession.`, 'Resolving 5 cases can reduce the demo score by up to 6 points.', 'Convene the legal cell, classify litigation, and seek scheduled hearings for acquisition blockers.', 'Project Legal Cell')
  if (p.approvalDays > 30) add('approval', 'Review delayed approvals', `${p.approvalsPending} clearances have an estimated processing time of ${p.approvalDays} days.`, 'A 30-day reduction removes approximately 5 risk points.', 'Escalate outstanding environmental and administrative clearances to the nodal authority.', 'State Nodal Officer')
  if (p.progress < 60) add('parcels', 'Prioritize high-risk parcels', `${p.pendingParcels.toLocaleString('en-IN')} parcels remain; acquisition is ${p.progress}% complete.`, 'Additional possession lowers both pending-parcel and progress contributions.', 'Create a parcel-level priority list and deploy additional field-verification teams.', 'Project Manager')
  if (!result.length) add('monitor', 'Maintain acquisition momentum', `${p.progress}% acquired with ${p.legalCases} open legal cases.`, 'Protect the current low-risk trajectory.', 'Continue fortnightly verification and reconcile remaining compensation records.', 'Project Manager')
  return result
}
export const ALERTS: Alert[] = PROJECTS.flatMap(p => {
  const entries: [string, string, string, string][] = []
  if (p.riskLevel === 'CRITICAL') entries.push(['critical', 'Critical risk project', `Risk score ${p.riskScore}/100; predicted delay ${p.expectedDelay} days.`, 'Convene an urgent cross-departmental review.'])
  if (p.riskChange >= 8) entries.push(['increase', 'Rapidly increasing risk', `Risk increased ${p.riskChange} points over the previous synthetic monthly snapshot.`, 'Review changes in compensation, litigation, and clearances.'])
  if (p.compensationPaid < 40) entries.push(['compensation', 'Compensation bottleneck', `${100 - p.compensationPaid}% of compensation remains pending.`, 'Schedule an award-disbursement camp.'])
  if (p.legalCases >= 15) entries.push(['legal', 'Legal case escalation', `${p.legalCases} legal cases remain unresolved.`, 'Escalate to the district legal cell.'])
  if (p.approvalDays >= 90) entries.push(['approval', 'Approval delays', `Clearance processing is estimated at ${p.approvalDays} days.`, 'Request a nodal-agency clearance review.'])
  if (p.progress < 40) entries.push(['progress', 'Acquisition behind schedule', `${p.progress}% acquired against a synthetic checkpoint target of 50%.`, 'Increase field verification and parcel prioritization.'])
  return entries.map(([id, category, reason, action]) => ({ id: `${p.id}-${id}`, projectId: p.id, projectName: p.name, severity: p.riskLevel, category, reason, action, date: `${SNAPSHOT_DATE}T09:00:00+05:30`, status: 'Open' as const }))
})
export const AUDIT_LOGS: AuditLog[] = [
  { id: 'seed-1', user: 'Demo Administrator', role: 'Admin', module: 'Data Management', action: 'Loaded synthetic project dataset', project: 'All projects', details: '24 demonstration records across 18 states. No government source was contacted.', timestamp: '2026-09-13T09:00:00+05:30', result: 'Success', source: 'Synthetic' },
  { id: 'seed-2', user: 'Demo Risk Engine', role: 'Demo engine', module: 'Risk Analysis', action: 'Calculated demonstration risk predictions', project: 'All projects', details: 'LS-DEMO-1.0 uses six deterministic factors and an 8-point baseline; no trained ML model.', timestamp: '2026-09-13T09:01:00+05:30', result: 'Success', source: 'Synthetic' },
  { id: 'seed-3', user: 'Demo District Officer', role: 'State/District Officer', module: 'Recommendations', action: 'Reviewed compensation bottlenecks', project: 'LS-2026-002', details: 'Illustrative review of outstanding compensation. No award or payment was changed.', timestamp: '2026-09-13T09:15:00+05:30', result: 'Reviewed', source: 'Synthetic' },
  { id: 'seed-4', user: 'Demo Project Manager', role: 'Project Manager', module: 'Impact Simulation', action: 'Compared an intervention scenario', project: 'LS-2026-001', details: 'Illustrative comparison of compensation, litigation, and parcel possession; original record unchanged.', timestamp: '2026-09-13T09:25:00+05:30', result: 'Success', source: 'Synthetic' },
  { id: 'seed-5', user: 'Demo District Officer', role: 'State/District Officer', module: 'Alerts', action: 'Reviewed clearance delay escalation', project: 'LS-2026-010', details: 'Synthetic review event only; it does not acknowledge or resolve a current session alert.', timestamp: '2026-09-13T09:40:00+05:30', result: 'Reviewed', source: 'Synthetic' },
  { id: 'seed-6', user: 'Demo Administrator', role: 'Admin', module: 'Data Management', action: 'Flagged an invalid sample CSV', project: 'Example import', details: 'Illustrative validation failure: acquired parcels exceeded the total. No records imported.', timestamp: '2026-09-13T10:00:00+05:30', result: 'Needs correction', source: 'Synthetic' },
  { id: 'seed-7', user: 'Demo Administrator', role: 'Admin', module: 'Model Performance', action: 'Reviewed model evaluation preview', project: 'LS-DEMO-1.0', details: 'Metrics, confusion matrix, and training metadata are prototype illustrations, not real evaluation results.', timestamp: '2026-09-13T10:15:00+05:30', result: 'Reviewed', source: 'Synthetic' },
]
const confusionMatrix = { truePositive: 445, falseNegative: 55, falsePositive: 90, trueNegative: 660 }
const evaluationTotal = Object.values(confusionMatrix).reduce((sum, count) => sum + count, 0)
const featureTotals = PROJECTS[0].prediction.factors.map(factor => ({
  name: factor.name,
  total: PROJECTS.reduce((sum, project) => sum + Math.abs(project.prediction.factors.find(f => f.id === factor.id)!.contribution), 0),
}))
const contributionTotal = featureTotals.reduce((sum, factor) => sum + factor.total, 0)
export const MODEL_PERFORMANCE: ModelPerformance = {
  version: 'LS-DEMO-1.0', lastTrained: '2026-09-10', trainingRecords: 12500, features: 18, isDemo: true,
  confusionMatrix,
  featureImportance: featureTotals.map(f => ({ name: f.name, importance: f.total / contributionTotal * 100 })).sort((a, b) => b.importance - a.importance),
  metrics: [
    { name: 'Accuracy', value: `${((confusionMatrix.truePositive + confusionMatrix.trueNegative) / evaluationTotal * 100).toFixed(1)}%`, description: 'Computed from the illustrative confusion matrix' },
    { name: 'Precision', value: `${(confusionMatrix.truePositive / (confusionMatrix.truePositive + confusionMatrix.falsePositive) * 100).toFixed(1)}%`, description: 'Illustrative delayed predictions that are correct' },
    { name: 'ROC-AUC', value: '0.91', description: 'Illustrative discrimination across risk thresholds' },
    { name: 'F1 Score', value: '0.86', description: 'Illustrative precision–recall balance' },
    { name: 'Recall', value: '0.89', description: 'Illustrative detection of delayed projects' },
    { name: 'MAE', value: '8.4 days', description: 'Illustrative mean absolute delay error' },
    { name: 'RMSE', value: '12.6 days', description: 'Illustrative root mean squared error' },
    { name: 'R²', value: '0.82', description: 'Illustrative explained delay variance' },
  ],
}
