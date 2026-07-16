import Link from "next/link";
import "./solution-cta.css";

export function SolutionCTA({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="shared-solution-cta">
      <div className="shared-solution-cta__inner">
        <div>
          <p>SOLUTION CONSULTATION</p>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
        <div className="shared-solution-cta__actions">
          <Link href="/solutions" className="shared-solution-cta__secondary">
            返回解决方案
          </Link>
          <Link href="/contact" className="shared-solution-cta__primary">
            联系方案顾问
          </Link>
        </div>
      </div>
    </section>
  );
}
