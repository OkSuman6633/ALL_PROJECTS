'use client';

interface HeroProps {
  totalAssessments: number;
}

export function Hero({ totalAssessments }: HeroProps) {
  const formattedCount = totalAssessments.toString().padStart(2, '0');

  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow light">EVIDENCE-LED PROCESS IMPROVEMENT</div>
        <h2>
          Find the friction.
          <br />
          <em>Quantify the opportunity.</em>
        </h2>
        <p>
          Turn confirmed workflow evidence into a traceable operational diagnostic.
          No guaranteed savings. No black-box financial claims.
        </p>
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="visual-orbit" />
        <div className="visual-core">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 18V9m5 9V5m5 13v-6m5 6V3" />
            <path d="m3 6 5-3 5 5 6-5" />
          </svg>
        </div>
        <span className="visual-node node-a">
          <i /> EVIDENCE
        </span>
        <span className="visual-node node-b">
          <i /> INSIGHTS
        </span>
        <span className="visual-node node-c">
          <i /> VALIDATED
        </span>
        <div className="visual-bars">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <div className="hero-stats">
        <div>
          <strong>{formattedCount}</strong>
          <span>Assessments</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>Human-reviewed claims</span>
        </div>
      </div>
    </section>
  );
}
