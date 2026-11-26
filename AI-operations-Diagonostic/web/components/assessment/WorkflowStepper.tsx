'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Assessment } from '@/types/assessment';
import { CheckIcon } from '@/components/icons';

interface WorkflowStepperProps {
  assessment: Assessment;
}

export function WorkflowStepper({ assessment }: WorkflowStepperProps) {
  const pathname = usePathname();

  const stages = [
    {
      step: '01',
      id: 'baseline',
      label: 'Baseline',
      desc: `${assessment.activities?.length || 0} activities`,
      isCompleted: (assessment.activities?.length || 0) > 0,
    },
    {
      step: '02',
      id: 'evidence',
      label: 'Evidence',
      desc: `${assessment.uploads?.length || 0} uploaded`,
      isCompleted: (assessment.uploads?.length || 0) > 0,
    },
    {
      step: '03',
      id: 'review',
      label: 'Review & Analyse',
      desc: assessment.status === 'COMPLETE' ? 'Facts verified' : 'Human review required',
      isCompleted:
        assessment.calculations !== null &&
        (assessment.calculations.unconfirmed_activity_count === 0 &&
          (assessment.calculations.invalid_activity_count || 0) === 0),
    },
    {
      step: '04',
      id: 'recommendations',
      label: 'Recommendations',
      desc: `${assessment.calculations?.recommendations?.length || 0} findings`,
      isCompleted: (assessment.calculations?.recommendations?.length || 0) > 0,
    },
    {
      step: '05',
      id: 'report',
      label: 'Report',
      desc: assessment.report_ready ? 'Report approved' : 'Approval pending',
      isCompleted: assessment.report_ready,
    },
  ];

  return (
    <div className="stepper-container">
      <nav aria-label="Workflow Stages" className="stepper-nav">
        {stages.map((stage, idx) => {
          const href = `/assessments/${assessment.id}/${stage.id}`;
          const isActive = pathname.endsWith(`/${stage.id}`);
          const statusClass = stage.isCompleted
            ? 'completed'
            : isActive
            ? 'active'
            : 'pending';

          return (
            <React.Fragment key={stage.id}>
              {idx > 0 && <span className="step-separator">›</span>}
              <Link
                href={href}
                className={`step-item ${statusClass} ${isActive ? 'active' : ''}`}
                title={`Go to Stage ${stage.step}: ${stage.label}`}
              >
                <div className="step-bubble">
                  {stage.isCompleted && !isActive ? (
                    <CheckIcon size={14} />
                  ) : (
                    stage.step
                  )}
                </div>
                <div className="step-content">
                  <span className="step-label">{stage.label}</span>
                  <span className="step-desc">{stage.desc}</span>
                </div>
              </Link>
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
}
