import { describe, expect, it } from "vitest";
import {
  casePendingKeys,
  commonSolutionDetailKeys,
  commonSolutionFilterKeys,
  downloadResourceKeys,
  industrySolutionDetailKeys,
  industrySolutionFilterKeys,
  partnerKeys,
  prototypePageRoutes,
  solutionListRoutes,
  solutionViewKeys,
} from "./prototype-route-map";

describe("prototype route map", () => {
  it("maps all 43 prototype pages to their public routes", () => {
    expect(prototypePageRoutes).toEqual({
      home: "/",
      products: "/product",
      "key-products": "/product/standalone",
      "mdd-2": "/product/code-agent",
      aippt: "/product/aippt",
      aishrek: "/product/aishrek",
      "model-optimization": "/product/model-optimization",
      "model-task-center": "/product/model-task-center",
      model: "/product/model",
      "model-assets": "/product/model-assets",
      "model-training": "/product/model-training",
      "model-evaluation": "/product/model-evaluation",
      "agent-knowledge-base": "/product/agent-knowledge-base",
      knowledge: "/product/knowledge",
      "knowledge-metrics": "/product/knowledge-metrics",
      "model-data": "/product/model-data",
      "model-deploy": "/product/model-deploy",
      coding: "/product/coding",
      "coding-project": "/product/coding-project",
      "coding-session": "/product/coding-session",
      "coding-mobile": "/product/coding-mobile",
      "coding-standard": "/product/coding-standard",
      agents: "/product/agents",
      "agent-knowledge": "/product/agent-knowledge",
      "agent-data": "/product/data-agent",
      "agent-video": "/product/agent-video",
      "agent-orchestration": "/product/agent-orchestration",
      applications: "/product/applications",
      "app-writing": "/product/app-writing",
      "app-bidding": "/product/app-bidding",
      "app-contract": "/product/app-contract",
      skills: "/product/skills",
      "skills-programming": "/product/skills-programming",
      "skills-application": "/product/skills-application",
      "skills-office": "/product/skills-office",
      governance: "/product/governance",
      solutions: "/solutions",
      "solution-detail": "/solutions/[slug]",
      downloads: "/downloads",
      partners: "/partners",
      pricing: "/pricing",
      contact: "/contact",
      trial: "/trial",
    });
  });

  it("locks all solution script state keys", () => {
    expect(commonSolutionDetailKeys).toEqual([
      "private-yuanqi",
      "cluster-planning",
      "compute-monitoring",
      "model-evaluation",
      "model-deployment",
      "knowledge-service",
      "document-intelligence",
      "data-insight",
      "knowledge-assets",
      "unstructured-data",
      "process-automation",
      "enterprise-assistant",
      "multi-agent",
      "video-intelligence",
    ]);
    expect(commonSolutionFilterKeys).toEqual([
      "infrastructure",
      "knowledge",
      "agents",
    ]);
    expect(industrySolutionDetailKeys).toEqual([
      "government-knowledge",
      "government-data",
      "government-document",
      "government-process",
      "finance-knowledge",
      "finance-data",
      "finance-document",
      "finance-assistant",
      "healthcare-knowledge",
      "healthcare-data",
      "healthcare-document",
      "healthcare-process",
      "enterprise-knowledge",
      "enterprise-data",
      "enterprise-document",
      "enterprise-process",
      "enterprise-multi-agent",
    ]);
    expect(industrySolutionFilterKeys).toEqual([
      "government",
      "finance",
      "healthcare",
      "enterprise",
    ]);
    expect(casePendingKeys).toEqual(["case-pending-enterprise-knowledge"]);
    expect(solutionViewKeys).toEqual([
      "overview",
      "list",
      "detail",
      "industry-list",
      "industry-detail",
      "case-list",
      "case-detail",
    ]);
  });

  it("locks the approved solution list query and landing-anchor routes", () => {
    expect(solutionListRoutes).toEqual({
      scenarios: {
        all: "/solutions?view=scenarios#solution-scenarios-directory",
        infrastructure:
          "/solutions?view=scenarios&category=infrastructure#solution-scenarios-directory",
        knowledge:
          "/solutions?view=scenarios&category=knowledge#solution-scenarios-directory",
        agents:
          "/solutions?view=scenarios&category=agents#solution-scenarios-directory",
      },
      industries: {
        all: "/solutions?view=industries#industry-solutions-list",
        government:
          "/solutions?view=industries&industry=government#industry-solutions-list",
        finance:
          "/solutions?view=industries&industry=finance#industry-solutions-list",
        healthcare:
          "/solutions?view=industries&industry=healthcare#industry-solutions-list",
        enterprise:
          "/solutions?view=industries&industry=enterprise#industry-solutions-list",
      },
      cases: {
        all: "/solutions?view=cases&mode=all#practice-cases-hero",
        industry: "/solutions?view=cases&mode=industry#practice-cases-list",
        scenario: "/solutions?view=cases&mode=scenario#practice-cases-list",
      },
    });
  });

  it("locks all partner script state keys", () => {
    expect(partnerKeys).toEqual([
      "overview",
      "business",
      "business-modes",
      "business-tiers",
      "business-benefits",
      "policy",
      "policy-types",
      "policy-cert",
      "policy-resources",
      "training",
      "training-system",
      "training-courses",
      "training-path",
      "training-resources",
      "become",
    ]);
  });

  it("locks all download resource keys", () => {
    expect(downloadResourceKeys).toEqual([
      "yuanqi-intro",
      "yuanqi-features",
      "yuanqi-arch",
      "mdd2-intro",
      "mdd2-features",
      "mdd2-env",
      "mdd2-client",
      "mdd2-deploy",
      "mdd2-usage",
      "yuanqi-deploy",
      "wp-ai",
      "wp-llm",
      "wp-agent",
    ]);
  });
});
