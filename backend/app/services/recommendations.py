from ..schemas.contracts import ProjectInput, Recommendation, RiskPrediction


def recommendations_for(project: ProjectInput, prediction: RiskPrediction) -> list[Recommendation]:
    rows: list[tuple[str, str, str, str, str]] = []
    if project.compensation_paid < 80:
        rows.append((
            "compensation", "Prioritize pending compensation cases",
            f"{100 - project.compensation_paid:g}% of compensation remains outstanding.",
            "Review disputed awards separately from unpaid compensation and coordinate disbursement.",
            "District Land Acquisition Officer",
        ))
    if project.legal_cases > 3:
        rows.append((
            "legal", "Escalate unresolved legal cases",
            f"{project.legal_cases} legal cases remain unresolved.",
            "Convene the legal cell, classify litigation, and review acquisition blockers.",
            "Project Legal Cell",
        ))
    if project.approval_days > 30:
        rows.append((
            "approval", "Review delayed approvals",
            f"Clearance processing is estimated at {project.approval_days} days.",
            "Review outstanding environmental and administrative clearances with the nodal authority.",
            "State Nodal Officer",
        ))
    if project.acquired_parcels / project.total_parcels * 100 < 60:
        rows.append((
            "parcels", "Prioritize high-risk parcels",
            f"{project.total_parcels - project.acquired_parcels} parcels remain to be acquired.",
            "Create a parcel-level review list and coordinate field verification.",
            "Project Manager",
        ))
    if not rows:
        rows.append((
            "monitor", "Maintain acquisition momentum", "No demo intervention threshold was exceeded.",
            "Continue verification and reconcile remaining compensation records.", "Project Manager",
        ))
    return [
        Recommendation(
            id=f"{project.id}-{id}", project_id=project.id, title=title,
            priority=prediction.level, reason=reason,
            impact="Illustrative guidance only; no validated risk reduction or delay saving is available.",
            action=action, owner=owner, is_demo=True,
        )
        for id, title, reason, action, owner in rows
    ]
