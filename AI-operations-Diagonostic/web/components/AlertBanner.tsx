'use client';

interface AlertBannerProps {
  error?: string;
  notice?: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
}

export function AlertBanner({
  error,
  notice,
  onDismissError,
  onDismissNotice,
}: AlertBannerProps) {
  return (
    <>
      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onDismissError} aria-label="Dismiss error">
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          <span>{notice}</span>
          <button type="button" onClick={onDismissNotice} aria-label="Dismiss notice">
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
