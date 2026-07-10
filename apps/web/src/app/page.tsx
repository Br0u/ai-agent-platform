import {
  CapabilityRail,
  EnterpriseProof,
  HeroEvidence,
  PlatformFlow,
  PrivateDeploymentClose,
  ResourceTable,
  SolutionIndex,
} from "../components/home-sections";

export default function HomePage() {
  return (
    <main className="home" aria-label="华鲲元启门户首页">
      <HeroEvidence />
      <CapabilityRail />
      <PlatformFlow />
      <EnterpriseProof />
      <SolutionIndex />
      <ResourceTable />
      <PrivateDeploymentClose />
    </main>
  );
}
