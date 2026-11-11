from typing import TypedDict
from langgraph.graph import END, START, StateGraph
from app.optimization.engine import optimize
from app.policies.engine import PolicyResult, verify_policy
from app.schemas.products import OptimizationResult, Product, PurchaseRequest


class WorkflowState(TypedDict, total=False):
    request: PurchaseRequest
    candidates: list[Product]
    optimization: OptimizationResult
    policy: PolicyResult
    events: list[dict]


def parse_intent(state: WorkflowState) -> WorkflowState:
    return {"events": state.get("events", []) + [{"type": "intent_received", "state": "IDLE"}]}


def discover(state: WorkflowState) -> WorkflowState:
    return {"events": state.get("events", []) + [{"type": "products_found", "count": len(state["candidates"]), "state": "DISCOVERING"}]}


def optimize_node(state: WorkflowState) -> WorkflowState:
    result = optimize(state["request"], state["candidates"])
    return {"optimization": result, "events": state.get("events", []) + [{"type": "optimization_completed", "evaluated": result.evaluated_candidates, "state": "OPTIMIZING"}]}


def verify_node(state: WorkflowState) -> WorkflowState:
    policy = verify_policy(state["request"], state["optimization"])
    return {"policy": policy, "events": state.get("events", []) + [{"type": "policy_passed" if policy.passed else "policy_blocked", "state": "VERIFYING"}]}


graph = StateGraph(WorkflowState)
graph.add_node("parse_intent", parse_intent)
graph.add_node("discover", discover)
graph.add_node("optimize", optimize_node)
graph.add_node("verify", verify_node)
graph.add_edge(START, "parse_intent")
graph.add_edge("parse_intent", "discover")
graph.add_edge("discover", "optimize")
graph.add_edge("optimize", "verify")
graph.add_edge("verify", END)
compiled_workflow = graph.compile()


def run_workflow(request: PurchaseRequest, candidates: list[Product], pre_events: list[dict] | None = None) -> WorkflowState:
    return compiled_workflow.invoke({"request": request, "candidates": candidates, "events": list(pre_events or [])})
