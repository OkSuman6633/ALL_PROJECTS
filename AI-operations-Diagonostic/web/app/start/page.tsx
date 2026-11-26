import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StartClient } from './StartClient';

export const metadata: Metadata = {
    title: 'New enquiry',
    description: 'Create an enquiry, upload your SOP and data, analyse it and download a cost report.',
};

export default function StartPage() {
    return (
        <Suspense
            fallback={
                <div className="wizard">
                    <div className="wizard-card">
                        <p className="wizard-hint">Loading your enquiry...</p>
                    </div>
                </div>
            }
        >
            <StartClient />
        </Suspense>
    );
}
