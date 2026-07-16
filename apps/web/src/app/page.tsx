import {
  EnterpriseProof,
  HeroEvidence,
  PlatformOverview,
  PrivateDeploymentClose,
  ResourceTable,
  SolutionIndex,
} from "../components/home-sections";
import { HomeRevealObserver } from "../components/home-reveal";

export default function HomePage() {
  return (
    <main className="home" aria-label="华鲲元启门户首页">
      <div className="home-atmosphere" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <HeroEvidence />
      <PlatformOverview />
      <EnterpriseProof />
      <SolutionIndex />
      <ResourceTable />
      <PrivateDeploymentClose />
      <HomeRevealObserver />
    </main>
  );
}
