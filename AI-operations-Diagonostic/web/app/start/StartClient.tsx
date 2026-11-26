'use client';

import { useSearchParams } from 'next/navigation';
import { EnquiryWizard } from '@/components/enquiry/EnquiryWizard';

export function StartClient() {
    const searchParams = useSearchParams();
    const assessmentId = searchParams.get('assessment') || undefined;

    return <EnquiryWizard key={assessmentId || 'new'} initialAssessmentId={assessmentId} />;
}
